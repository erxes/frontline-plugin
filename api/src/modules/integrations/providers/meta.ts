import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { config } from '#/config.ts';
import type { MetaProvider } from '#/db/meta.ts';
import type { StoredFile } from '#/db/table.ts';
import { attachedFile } from '#/modules/files.ts';
import { ProviderRefused } from '../providerApi.ts';
import {
  AccountRefused,
  defineProvider,
  sendInParts,
  type OpenAccount,
  type OutboundMessage,
  type OutboundReaction,
  type ProviderName,
} from '../provider.ts';
import { blockMessages } from './metaBlocks.ts';
import { forgetConnection } from './metaConnection.ts';
import { graph, Secret } from './metaGraph.ts';
import { metaText } from './metaText.ts';
import { routeThroughRelay, unrouteFromRelay } from './metaRelay.ts';
import { postOfThread } from './metaWebhook.ts';

type MetaAccount = OpenAccount<unknown, z.infer<typeof Secret>>;

/**
 * `call` through the account's page token. When Meta refuses the token, the app of the core
 * connection the page came through is read again on its next use.
 */
const watched = <T>({ row }: MetaAccount, call: Promise<T>) =>
  call.catch((error: unknown) => {
    if (error instanceof AccountRefused) forgetConnection(row.connectionId);

    throw error;
  });

const Sent = z.object({ message_id: z.string() });

const Created = z.object({ id: z.string() });

/** Messenger takes a reply within 24 hours of the customer's message, later only as a person's. */
const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * A Graph call's `fields` as a multipart form, each object as JSON as Meta reads it, with the
 * attached file's bytes from core as `fileField`: Meta can't reach core's files by address.
 */
const withFile = async (
  orgId: string,
  file: StoredFile,
  fileField: string,
  fields: Record<string, unknown>,
) => {
  const read = await attachedFile(orgId, file);
  const form = new FormData();

  for (const [name, value] of Object.entries(fields))
    form.set(name, typeof value === 'string' ? value : JSON.stringify(value));

  form.set(fileField, read);

  return form;
};

/**
 * `send` to `target`, and again to `fallback` when Meta refuses it. A quoted message or comment
 * may be gone, or be a button tap Meta never gave an id, and Meta, unlike Telegram and Discord,
 * then refuses the whole reply.
 */
const orElse = async <Target, T>(
  target: Target,
  fallback: Target,
  send: (to: Target) => Promise<T>,
) => {
  try {
    return await send(target);
  } catch (error) {
    // Only a 4xx refusal sends it again: a server's fault, or an answer that isn't JSON, may
    // come after the message went.
    if (
      !(error instanceof ProviderRefused) ||
      error.status < 400 ||
      error.status >= 500 ||
      target === fallback
    )
      throw error;

    return send(fallback);
  }
};

/** One message of a reply: a file, or Meta's message fields with the text a block falls back to. */
type Part = { file: StoredFile } | { message: Record<string, unknown>; fallback?: string };

/**
 * Sends the text, then each attachment, then what a core agent showed below its answer, each as
 * a message of its own, as Messenger and Instagram take them (`metaBlocks.ts`). A block Meta
 * refuses in its own form, such as a picture Instagram can't show, goes as text with its link.
 * Each part is recorded as it goes, so an attempt after a failed part sends only what is left
 * and the customer never gets the text twice.
 */
const sendMessage = async ({ row, secret }: MetaAccount, message: OutboundMessage) => {
  const late =
    message.replyTo !== null && Date.now() - message.replyTo.createdAt.getTime() > REPLY_WINDOW_MS;

  const fields = {
    recipient: { id: message.threadId },
    ...(late
      ? { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }
      : { messaging_type: 'RESPONSE' }),
  };

  // Messenger and Instagram show no markdown, so the bot's answer goes as the text it reads as.
  const text = message.byBot ? metaText(message.text) : message.text;

  // Messenger shows the messages in the order they reach it.
  const parts: Part[] = [
    ...(text ? [{ message: { text } }] : []),
    ...message.attachments.map((file) => ({ file })),
    ...blockMessages(message.blocks),
  ];

  const send = async (part: Part, mid: string | null) => {
    const quote = mid ? { reply_to: { mid } } : {};

    return Sent.parse(
      await graph('me/messages', secret.pageToken, {
        method: 'POST',
        body:
          'file' in part
            ? await withFile(row.orgId, part.file, 'filedata', {
                ...fields,
                message: {
                  ...quote,
                  attachment: {
                    type: part.file.type?.startsWith('image/') ? 'image' : 'file',
                    payload: { is_reusable: false },
                  },
                },
              })
            : { ...fields, message: { ...quote, ...part.message } },
      }),
    ).message_id;
  };

  const shown = (part: Part, mid: string | null) =>
    'message' in part && part.fallback !== undefined
      ? orElse<Part, string>(part, { message: { text: part.fallback } }, (each) => send(each, mid))
      : send(part, mid);

  // The first one quotes the message the member answers.
  const [first] = await sendInParts(message.parts, parts, (part) =>
    part === parts[0]
      ? orElse(message.quotedId, null, (mid) => shown(part, mid))
      : shown(part, null),
  );

  if (!first) throw new Error('Nothing to send');

  return first;
};

/**
 * Answers the comment the member picked under it on the post, or the customer's latest in the
 * thread when none is picked or the picked one is gone. Facebook mentions them and takes one
 * attachment; Instagram takes text only.
 */
const replyToComment = async (
  provider: ProviderName,
  { row, secret }: MetaAccount,
  message: OutboundMessage,
) => {
  const latest = message.replyTo?.externalId;
  const picked = message.quotedId ?? latest;

  if (!picked) throw new Error('No comment to answer');

  if (provider === 'instagram' && message.attachments.length)
    throw new Error('Instagram comment replies take text only');

  const [file] = message.attachments;
  const fields = { message: `@[${message.to}] ${message.text}` };

  return orElse(
    picked,
    latest ?? picked,
    async (commentId) =>
      Created.parse(
        provider === 'instagram'
          ? await graph(`${commentId}/replies`, secret.pageToken, {
              method: 'POST',
              body: { message: message.text },
            })
          : await graph(`${commentId}/comments`, secret.pageToken, {
              method: 'POST',
              body: file ? await withFile(row.orgId, file, 'source', fields) : fields,
            }),
      ).id,
  );
};

const sendThrough = (provider: ProviderName) => (account: MetaAccount, message: OutboundMessage) =>
  watched(
    account,
    postOfThread(message.threadId)
      ? replyToComment(provider, account, message)
      : sendMessage(account, message),
  );

/** The only reaction Messenger and Instagram take from a page. */
const LOVE = '❤';

/**
 * Puts the page's ❤️ on the customer's message, or takes it back when no member has it. A
 * comment takes no reactions this way.
 */
const reactThrough = async (account: MetaAccount, reaction: OutboundReaction) => {
  const { secret } = account;
  const loved = reaction.emojis.some((emoji) => emoji.replaceAll('️', '') === LOVE);

  if (postOfThread(reaction.threadId) || reaction.emoji.replaceAll('️', '') !== LOVE)
    throw new ORPCError('BAD_REQUEST', { message: 'Meta takes only ❤️ on a message' });

  // Not through askMeta: the inbox names the provider in its refusal, and the adapter needs a
  // refused token as it is to mark the page broken.
  await watched(
    account,
    graph('me/messages', secret.pageToken, {
      method: 'POST',
      body: {
        recipient: { id: reaction.to },
        sender_action: loved ? 'react' : 'unreact',
        payload: loved
          ? { message_id: reaction.message.externalId, reaction: 'love' }
          : { message_id: reaction.message.externalId },
      },
    }),
  );
};

/**
 * The events frontline reads from a page: messages, postbacks, reactions and feed, and the fields
 * the older erxes installs that share the app subscribe. Fields frontline doesn't read are
 * skipped when they arrive.
 */
const PAGE_FIELDS = [
  'conversations',
  'feed',
  'message_deliveries',
  'message_echoes',
  'message_reactions',
  'message_reads',
  'messages',
  'messaging_handovers',
  'messaging_postbacks',
  'messaging_referrals',
  'standby',
];

const TokenApp = z.object({ id: z.string() });

const PageApps = z.object({
  data: z.array(z.object({ id: z.string(), subscribed_fields: z.array(z.string()).default([]) })),
});

/**
 * Subscribes the page token's app to the page's events. A POST replaces the app's fields, so
 * frontline's join the ones it has, and core's automations on the same app (lead forms,
 * mentions, reviews) keep theirs. Resolves to the app's id.
 */
export const subscribeToPage = async (pageId: string, pageToken: string) => {
  const [app, apps] = await Promise.all([
    graph('app', pageToken, { query: { fields: 'id' } }).then((body) => TokenApp.parse(body)),
    graph(`${pageId}/subscribed_apps`, pageToken, {
      query: { fields: 'id,subscribed_fields' },
    }).then((body) => PageApps.parse(body)),
  ]);

  const had = apps.data.find((subscribed) => subscribed.id === app.id)?.subscribed_fields ?? [];

  await graph(`${pageId}/subscribed_apps`, pageToken, {
    method: 'POST',
    query: { subscribed_fields: [...new Set([...had, ...PAGE_FIELDS])].join(',') },
  });

  return app.id;
};

/**
 * Repair, as the old plugin's did for a page or account whose events stopped: the app subscribes
 * to its page again, and meta-relay routes it here again when the app is the install's. An
 * account whose core connection went has no webhook key; it connects again instead.
 */
const resubscribe = async (
  provider: MetaProvider,
  { row, secret }: MetaAccount,
  pageId: string,
  webhookKey: string | null,
) => {
  if (!webhookKey)
    throw new Error(
      "Its Facebook connection went: connect it again through erxes's Facebook connection",
    );

  const appId = await subscribeToPage(pageId, secret.pageToken);

  if (appId === config.meta.appId) await routeThroughRelay(provider, row.externalId);
};

const checkToken = async (account: MetaAccount) =>
  watched(account, graph('me', account.secret.pageToken, { query: { fields: 'id' } })).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : 'Meta failed'),
  );

const FacebookPerson = z.object({
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

const InstagramPerson = z.object({ name: z.string().optional(), username: z.string().optional() });

/**
 * The name Meta keeps for someone who messaged the page or the account. Messenger and Instagram
 * events give only their page-scoped id.
 */
const whoIsOn =
  (provider: MetaProvider) =>
  async ({ secret }: MetaAccount, id: string) => {
    if (provider === 'instagram') {
      const { name, username } = InstagramPerson.parse(
        await graph(id, secret.pageToken, { query: { fields: 'name,username' } }),
      );

      const firstName = name || (username && `@${username}`);

      return firstName ? { firstName } : null;
    }

    const person = FacebookPerson.parse(
      await graph(id, secret.pageToken, { query: { fields: 'first_name,last_name' } }),
    );

    return person.first_name ? { firstName: person.first_name, lastName: person.last_name } : null;
  };

const Picture = z.object({ profile_pic: z.string().optional() });

/**
 * The profile picture Meta shows for someone who messaged the page or the account, on Meta's CDN
 * behind a link that expires.
 */
const pictureOn = async ({ secret }: MetaAccount, id: string) =>
  Picture.parse(await graph(id, secret.pageToken, { query: { fields: 'profile_pic' } }))
    .profile_pic ?? null;

/**
 * Removes the account's meta-relay route. The app stays subscribed to the page: core's
 * automations, or another erxes install sharing the app, may still read it.
 */
const disconnectFrom =
  (provider: MetaProvider) =>
  ({ row }: MetaAccount) =>
    unrouteFromRelay(provider, row.externalId);

/** A Facebook page: Messenger conversations, and the comments on its posts. */
export const facebook = defineProvider({
  name: 'facebook',
  Config: z.object({}),
  Secret,
  check: checkToken,
  send: sendThrough('facebook'),
  react: reactThrough,
  disconnect: disconnectFrom('facebook'),
  repair: (account, webhookKey) =>
    resubscribe('facebook', account, account.row.externalId, webhookKey),
  whoIs: whoIsOn('facebook'),
  pictureOf: pictureOn,
});

/** An Instagram professional account, reached through its Facebook page's token. */
export const instagram = defineProvider({
  name: 'instagram',
  Config: z.object({ pageId: z.string(), username: z.string().optional() }),
  Secret,
  check: checkToken,
  send: sendThrough('instagram'),
  react: reactThrough,
  disconnect: disconnectFrom('instagram'),
  repair: (account, webhookKey) =>
    resubscribe('instagram', account, account.config.pageId, webhookKey),
  whoIs: whoIsOn('instagram'),
  pictureOf: pictureOn,
});
