import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { config } from '#/config.ts';
import type { Tx } from '#/db/client.ts';
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
import { unrouteFromRelay } from './metaRelay.ts';
import { postOfThread } from './metaWebhook.ts';

/** The Graph API version frontline's calls and Meta's login dialog use. */
export const GRAPH_VERSION = 'v23.0';

/** Why the Graph API refused a call, in its own words. */
class MetaError extends Error {}

const GraphFailure = z.object({ error: z.object({ message: z.string() }) });

/**
 * A Graph API call with `token` in the Authorization header, so tokens stay out of addresses
 * and logs. Resolves to the parsed body, or fails with Meta's message.
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

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(config.outboundMs),
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

/** Sends the text, then each attachment as a message of its own, as Messenger takes them. */
const sendMessage = async ({ secret }: MetaAccount, message: OutboundMessage) => {
  const bodies = [
    ...(message.text ? [{ text: message.text }] : []),
    ...message.attachments.map((file) => ({
      attachment: {
        type: file.type?.startsWith('image/') ? 'image' : 'file',
        payload: { url: file.url, is_reusable: false },
      },
    })),
  ];

  const late =
    message.replyTo !== null && Date.now() - message.replyTo.createdAt.getTime() > REPLY_WINDOW_MS;

  // Messenger shows the messages in the order they reach it.
  const [first] = await inOrder(
    bodies,
    async (body) =>
      Sent.parse(
        await graph('me/messages', secret.pageToken, {
          method: 'POST',
          body: {
            recipient: { id: message.threadId },
            ...(late
              ? { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' }
              : { messaging_type: 'RESPONSE' }),
            message: body,
          },
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
  { secret }: MetaAccount,
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

  return Created.parse(
    await graph(`${commentId}/comments`, secret.pageToken, {
      method: 'POST',
      body: { message: `@[${message.to}] ${message.text}`, attachment_url: file?.url },
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

const checkToken = async ({ secret }: MetaAccount) =>
  graph('me', secret.pageToken, { query: { fields: 'id' } }).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : 'Meta failed'),
  );

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
});
