import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { config } from '#/config.ts';
import {
  defineProvider,
  inOrder,
  type InboundMessage,
  type OpenAccount,
  type OutboundMessage,
  type WebhookSource,
} from '../provider.ts';
import { sameText } from '../secrets.ts';
import { metaKey } from '../store.ts';

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

const Sent = z.object({ message_id: z.string() });

/** Sends the text, then each attachment as a message of its own, as Messenger takes them. */
const sendThrough = async (
  { secret }: OpenAccount<unknown, z.infer<typeof Secret>>,
  message: OutboundMessage,
) => {
  const bodies = [
    ...(message.text ? [{ text: message.text }] : []),
    ...message.attachments.map((file) => ({
      attachment: {
        type: file.type?.startsWith('image/') ? 'image' : 'file',
        payload: { url: file.url, is_reusable: false },
      },
    })),
  ];

  // Messenger shows the messages in the order they reach it.
  const [first] = await inOrder(
    bodies,
    async (body) =>
      Sent.parse(
        await graph('me/messages', secret.pageToken, {
          method: 'POST',
          body: { recipient: { id: message.threadId }, messaging_type: 'RESPONSE', message: body },
        }),
      ).message_id,
  );

  if (!first) throw new MetaError('Nothing to send');

  return first;
};

const checkToken = async ({ secret }: OpenAccount<unknown, z.infer<typeof Secret>>) =>
  graph('me', secret.pageToken, { query: { fields: 'id' } }).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : 'Meta failed'),
  );

/** A Facebook page: Messenger conversations with the people who write to it. */
export const facebook = defineProvider({
  name: 'facebook',
  Config: z.object({}),
  Secret,
  check: checkToken,
  send: sendThrough,
});

/** An Instagram professional account, reached through its Facebook page's token. */
export const instagram = defineProvider({
  name: 'instagram',
  Config: z.object({ pageId: z.string(), username: z.string().optional() }),
  Secret,
  check: checkToken,
  send: sendThrough,
});

/** One Messenger or Instagram messaging event, the parts the inbox reads. */
const Messaging = z.object({
  sender: z.object({ id: z.string() }),
  recipient: z.object({ id: z.string() }),
  timestamp: z.number(),
  message: z
    .object({
      mid: z.string(),
      text: z.string().optional(),
      is_echo: z.boolean().optional(),
      attachments: z
        .array(z.object({ type: z.string(), payload: z.object({ url: z.string() }).partial() }))
        .optional(),
    })
    .optional(),
});

const Delivery = z.object({
  object: z.enum(['page', 'instagram']),
  entry: z.array(z.object({ id: z.string(), messaging: z.array(z.unknown()).optional() })),
});

/** Meta signs the body it sent with the app secret (`X-Hub-Signature-256`). */
const signedByMeta = (raw: string, signature: unknown) => {
  if (!config.meta.appSecret) return false;

  return sameText(
    `sha256=${createHmac('sha256', config.meta.appSecret).update(raw).digest('hex')}`,
    signature,
  );
};

const inboundOf = (event: z.infer<typeof Messaging>): InboundMessage[] => {
  const { message } = event;

  // An echo is the page's own message, a reply frontline or Meta's app sent.
  if (!message || message.is_echo) return [];

  return [
    {
      threadId: event.sender.id,
      messageId: message.mid,
      author: { externalId: event.sender.id },
      text: message.text ?? '',
      attachments: (message.attachments ?? []).flatMap(({ type, payload }) =>
        payload.url ? [{ url: payload.url, name: type, type }] : [],
      ),
    },
  ];
};

/**
 * Meta posts every page's and Instagram account's events to one address, signed with the app
 * secret, and names each account in its entries.
 */
export const metaWebhook: WebhookSource = {
  confirm: (query) =>
    query['hub.mode'] === 'subscribe' &&
    config.meta.verifyToken &&
    query['hub.verify_token'] === config.meta.verifyToken &&
    typeof query['hub.challenge'] === 'string'
      ? query['hub.challenge']
      : null,
  route: ({ raw, body, headers }) => {
    if (!signedByMeta(raw, headers['x-hub-signature-256'])) return null;

    const delivery = Delivery.parse(body);

    const provider = delivery.object === 'page' ? 'facebook' : 'instagram';

    return delivery.entry.map((entry) => ({
      provider,
      key: metaKey(provider, entry.id),
      events: entry.messaging ?? [],
    }));
  },
  receive: (_row, events) => events.flatMap((event) => inboundOf(Messaging.parse(event))),
};
