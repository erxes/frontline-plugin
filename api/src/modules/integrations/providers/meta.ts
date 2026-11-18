import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { config } from '#/config.ts';
import type { Tx } from '#/db/client.ts';
import type { StoredFile } from '#/db/table.ts';
import { attachedFile } from '#/modules/files.ts';
import { openSecret } from '../secrets.ts';
import { accountRow } from '../store.ts';
import {
  defineProvider,
  inOrder,
  type OpenAccount,
  type OutboundMessage,
  type OutboundReaction,
  type ProviderName,
} from '../provider.ts';
import { routeThroughRelay, unrouteFromRelay } from './metaRelay.ts';
import { postOfThread } from './metaWebhook.ts';

/** The Graph API version frontline's calls and Meta's login dialog use. */
export const GRAPH_VERSION = 'v23.0';

/** Why the Graph API refused a call, in its own words. */
class MetaError extends Error {}

const GraphFailure = z.object({ error: z.object({ message: z.string() }) });

/**
 * A Graph API call with `token` in the Authorization header, so tokens stay out of addresses
 * and logs. `body` goes as JSON, or as it is when it's a form with a file. Resolves to the parsed
 * body, or fails with Meta's message.
 */
export const graph = async (
  path: string,
  token: string | null,
  options: {
    method?: 'GET' | 'POST' | 'DELETE';
    query?: Record<string, string>;
    body?: unknown;
  } = {},
) => {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`);

  for (const [name, value] of Object.entries(options.query ?? {}))
    url.searchParams.set(name, value);

  const { body: sent } = options;
  const form = sent instanceof FormData;

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(sent && !form ? { 'content-type': 'application/json' } : {}),
    },
    body: form ? sent : sent ? JSON.stringify(sent) : undefined,
    // A file takes longer to go than a call.
    signal: AbortSignal.timeout((form ? 4 : 1) * config.outboundMs),
  });

  const body: unknown = await response.json();

  if (!response.ok) {
    const failure = GraphFailure.safeParse(body);

    throw new MetaError(
      failure.success ? failure.data.error.message : `Meta answered ${response.status}`,
    );
  }

  return body;
};

const Secret = z.object({ pageToken: z.string() });

/** A connected Facebook page or Instagram account by id, with its page token, or NOT_FOUND. */
export const metaAccount = async (tx: Tx, id: string) => {
  const row = await accountRow(tx, id);

  if (row.provider !== 'facebook' && row.provider !== 'instagram')
    throw new ORPCError('NOT_FOUND', { message: 'No such Facebook page or Instagram account' });

  return {
    row,
    provider: row.provider,
    token: openSecret(row.orgId, row.secret, Secret).pageToken,
  };
};

/** `call`, with Meta's refusal as a BAD_REQUEST the member reads. */
export const askMeta = <T>(call: Promise<T>) =>
  call.catch((error: unknown) => {
    if (error instanceof MetaError)
      throw new ORPCError('BAD_REQUEST', { message: `Meta refused: ${error.message}` });

    throw error;
  });

type MetaAccount = OpenAccount<unknown, z.infer<typeof Secret>>;

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

  const bytes = await new Response(read.body).arrayBuffer();

  form.set(fileField, new Blob([bytes], { type: read.contentType }), file.name);

  return form;
};

/** Sends the text, then each attachment as a message of its own, as Messenger takes them. */
const sendMessage = async ({ row, secret }: MetaAccount, message: OutboundMessage) => {
  const late =
    message.replyTo !== null && Date.now() - message.replyTo.createdAt.getTime() > REPLY_WINDOW_MS;

  const fields = {
    recipient: { id: message.threadId },
    ...(late
      ? { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }
      : { messaging_type: 'RESPONSE' }),
  };

  // Messenger shows the messages in the order they reach it; null is the text.
  const [first] = await inOrder(
    [...(message.text ? [null] : []), ...message.attachments],
    async (file) =>
      Sent.parse(
        await graph('me/messages', secret.pageToken, {
          method: 'POST',
          body: file
            ? await withFile(row.orgId, file, 'filedata', {
                ...fields,
                message: {
                  attachment: {
                    type: file.type?.startsWith('image/') ? 'image' : 'file',
                    payload: { is_reusable: false },
                  },
                },
              })
            : { ...fields, message: { text: message.text } },
        }),
      ).message_id,
  );

  if (!first) throw new MetaError('Nothing to send');

  return first;
};

/**
 * Answers the customer's latest comment in the thread, under it on the post. Facebook mentions
 * them and takes one attachment; Instagram takes text only.
 */
const replyToComment = async (
  provider: ProviderName,
  { row, secret }: MetaAccount,
  message: OutboundMessage,
) => {
  const commentId = message.replyTo?.externalId;

  if (!commentId) throw new MetaError('No comment to answer');

  if (provider === 'instagram') {
    if (message.attachments.length) throw new MetaError('Instagram comment replies take text only');

    return Created.parse(
      await graph(`${commentId}/replies`, secret.pageToken, {
        method: 'POST',
        body: { message: message.text },
      }),
    ).id;
  }

  const [file] = message.attachments;
  const fields = { message: `@[${message.to}] ${message.text}` };

  return Created.parse(
    await graph(`${commentId}/comments`, secret.pageToken, {
      method: 'POST',
      body: file ? await withFile(row.orgId, file, 'source', fields) : fields,
    }),
  ).id;
};

const sendThrough = (provider: ProviderName) => (account: MetaAccount, message: OutboundMessage) =>
  postOfThread(message.threadId)
    ? replyToComment(provider, account, message)
    : sendMessage(account, message);

/** The only reaction Messenger and Instagram take from a page. */
const LOVE = '❤';

/**
 * Puts the page's ❤️ on the customer's message, or takes it back when no member has it. A
 * comment takes no reactions this way.
 */
const reactThrough = async ({ secret }: MetaAccount, reaction: OutboundReaction) => {
  const loved = reaction.emojis.some((emoji) => emoji.replaceAll('️', '') === LOVE);

  if (postOfThread(reaction.threadId) || reaction.emoji.replaceAll('️', '') !== LOVE)
    throw new ORPCError('BAD_REQUEST', { message: 'Meta takes only ❤️ on a message' });

  await askMeta(
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
 * The events the app gets for a connected page: frontline's own (messages, postbacks,
 * reactions, feed), and every field the older erxes installs that share the app subscribe. A
 * page's `subscribed_apps` POST replaces the app's fields, so a shorter list would stop events
 * those installs read. Fields frontline doesn't read are skipped when they arrive.
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

/** Subscribes the app to the page's events, with the page's own token. */
export const subscribeToPage = (pageId: string, pageToken: string) =>
  graph(`${pageId}/subscribed_apps`, pageToken, {
    method: 'POST',
    query: { subscribed_fields: PAGE_FIELDS.join(',') },
  });

/**
 * Repair, as the old plugin's did for a page or account whose events stopped: the app subscribes
 * to its page again, and meta-relay, when set, routes it here again.
 */
const resubscribe = async (
  provider: 'facebook' | 'instagram',
  { row, secret }: MetaAccount,
  pageId: string,
) => {
  await Promise.all([
    subscribeToPage(pageId, secret.pageToken),
    routeThroughRelay(provider, row.externalId),
  ]);
};

const checkToken = async ({ secret }: MetaAccount) =>
  graph('me', secret.pageToken, { query: { fields: 'id' } }).then(
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
  (provider: 'facebook' | 'instagram') =>
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

/**
 * Removes the account's meta-relay route. The app stays subscribed to the page: another erxes
 * install sharing the app may still read it.
 */
const disconnectFrom =
  (provider: 'facebook' | 'instagram') =>
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
  repair: (account) => resubscribe('facebook', account, account.row.externalId),
  whoIs: whoIsOn('facebook'),
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
  repair: (account) => resubscribe('instagram', account, account.config.pageId),
  whoIs: whoIsOn('instagram'),
});
