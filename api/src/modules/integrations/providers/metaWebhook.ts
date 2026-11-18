import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { config } from '#/config.ts';
import { COMMENT_RECEIVED } from '#/core.ts';
import type { StoredFile } from '#/db/table.ts';
import { logger } from '#/logger.ts';
import type { InboundMessage, InboundReaction, ProviderName, WebhookSource } from '../provider.ts';
import { sameText } from '../secrets.ts';
import { metaKey } from '../store.ts';

/** The conversation of one person's comments on one post: `comment:<post id>:<their id>`. */
const commentThread = (postId: string, authorId: string) => `comment:${postId}:${authorId}`;

/** The post a comment thread hangs under, or null for a Messenger or Instagram chat. */
export const postOfThread = (threadId: string | null) =>
  threadId?.startsWith('comment:') ? (threadId.split(':')[1] ?? null) : null;

const File = z.object({ url: z.string(), title: z.string(), sticker_id: z.number() }).partial();

/** One Messenger or Instagram messaging event, the parts the inbox reads. */
const Messaging = z.object({
  sender: z.object({ id: z.string() }),
  timestamp: z.number(),
  message: z
    .object({
      mid: z.string(),
      text: z.string().optional(),
      is_echo: z.boolean().optional(),
      is_deleted: z.boolean().optional(),
      quick_reply: z.object({ payload: z.string() }).optional(),
      reply_to: z.object({ story: z.object({ url: z.string() }).optional() }).optional(),
      attachments: z.array(z.object({ type: z.string(), payload: File.nullish() })).optional(),
    })
    .optional(),
  // A person put an emoji on a message, or took theirs back: one each on Messenger and Instagram.
  reaction: z
    .object({
      mid: z.string(),
      action: z.enum(['react', 'unreact']),
      emoji: z.string().optional(),
    })
    .optional(),
  // A tap on a bot's button, persistent menu item, ice breaker or Get Started.
  postback: z
    .object({ mid: z.string().optional(), title: z.string(), payload: z.string().optional() })
    .optional(),
});

/** A new comment on a page's post (`feed`) or on an Instagram account's media (`comments`). */
const Change = z.discriminatedUnion('field', [
  z.object({
    field: z.literal('feed'),
    value: z.looseObject({
      item: z.string(),
      verb: z.string(),
      comment_id: z.string().optional(),
      post_id: z.string().optional(),
      parent_id: z.string().optional(),
      message: z.string().optional(),
      photo: z.string().optional(),
      video: z.string().optional(),
      from: z.object({ id: z.string(), name: z.string().optional() }).optional(),
    }),
  }),
  z.object({
    field: z.literal('comments'),
    value: z.object({
      id: z.string(),
      text: z.string().optional(),
      parent_id: z.string().optional(),
      from: z.object({ id: z.string(), username: z.string().optional() }),
      media: z.object({ id: z.string() }),
    }),
  }),
]);

const Delivery = z.object({
  object: z.enum(['page', 'instagram']),
  entry: z.array(
    z.object({
      id: z.string(),
      messaging: z.array(z.unknown()).optional(),
      changes: z.array(z.object({ field: z.string(), value: z.unknown() })).optional(),
    }),
  ),
});

/** Meta signs the body it sent with the app secret (`X-Hub-Signature-256`). */
const signedByMeta = (raw: string, signature: unknown) => {
  if (!config.meta.appSecret) return false;

  return sameText(
    `sha256=${createHmac('sha256', config.meta.appSecret).update(raw).digest('hex')}`,
    signature,
  );
};

const filesOf = (attachments: z.infer<typeof Messaging>['message'] = { mid: '' }) =>
  (attachments.attachments ?? []).flatMap(({ type, payload }): StoredFile[] =>
    payload?.url ? [{ url: payload.url, name: payload.title ?? type, type }] : [],
  );

/** A chat message or a tapped button; it publishes its provider's `MESSAGE_RECEIVED`. */
const fromMessaging = (event: z.infer<typeof Messaging>) => {
  const { message, postback, sender } = event;
  const author = { externalId: sender.id };
  const base = { threadId: sender.id, author };

  if (postback)
    return [
      {
        ...base,
        messageId: postback.mid ?? `postback:${sender.id}:${event.timestamp}`,
        text: postback.title,
        attachments: [],
        providerData: { payload: postback.payload ?? null },
      },
    ];

  // An echo is the page's own message, a reply frontline or Meta's app sent.
  if (!message || message.is_echo || message.is_deleted) return [];

  const story = message.reply_to?.story;

  return [
    {
      ...base,
      messageId: message.mid,
      text: message.text ?? '',
      attachments: [
        ...(story ? [{ url: story.url, name: 'story', type: 'story' }] : []),
        ...filesOf(message),
      ],
      providerData: message.quick_reply ? { payload: message.quick_reply.payload } : undefined,
    },
  ];
};

/** A person's comment, in the thread of their comments on that post. The page's own are left out. */
const fromChange = (
  provider: ProviderName,
  accountId: string,
  change: z.infer<typeof Change>,
): InboundMessage[] => {
  const event = COMMENT_RECEIVED[provider === 'instagram' ? 'instagram' : 'facebook'].type;

  if (change.field === 'comments') {
    const { value } = change;

    if (value.from.id === accountId) return [];

    return [
      {
        threadId: commentThread(value.media.id, value.from.id),
        messageId: value.id,
        author: { externalId: value.from.id, name: value.from.username },
        text: value.text ?? '',
        attachments: [],
        providerData: { postId: value.media.id, commentId: value.id },
        event,
      },
    ];
  }

  const { value } = change;

  if (
    value.item !== 'comment' ||
    value.verb !== 'add' ||
    !value.comment_id ||
    !value.post_id ||
    !value.from ||
    value.from.id === accountId
  )
    return [];

  const media = value.photo ?? value.video;

  return [
    {
      threadId: commentThread(value.post_id, value.from.id),
      messageId: value.comment_id,
      author: { externalId: value.from.id, name: value.from.name },
      text: value.message ?? '',
      attachments: media ? [{ url: media, name: value.photo ? 'photo' : 'video' }] : [],
      providerData: { postId: value.post_id, commentId: value.comment_id },
      event,
    },
  ];
};

/** One event of an entry: a messaging event, or a change Meta posts for the account's feed. */
const MetaEvent = z.union([Messaging, z.object({ change: Change })]);

/**
 * Meta posts every page's and Instagram account's events to one address, signed with the app
 * secret, and names each account in its entries. A change frontline doesn't read, such as a
 * like, is left out.
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
      events: [
        ...(entry.messaging ?? []),
        ...(entry.changes ?? []).flatMap((change) =>
          Change.safeParse(change).success ? [{ change }] : [],
        ),
      ],
    }));
  },
  // An event that isn't the shape frontline reads is logged and left out, so the messages Meta
  // batched with it are still kept.
  receive: (row, events) => {
    const parsed = events.flatMap((raw) => {
      const event = MetaEvent.safeParse(raw);

      if (event.success) return [event.data];

      logger.warn({ accountId: row.id, issues: event.error.issues }, 'Meta event left out');

      return [];
    });

    return {
      messages: parsed.flatMap((event) =>
        'change' in event
          ? fromChange(row.provider, row.externalId, event.change)
          : fromMessaging(event),
      ),
      reactions: parsed.flatMap((event): InboundReaction[] =>
        'reaction' in event && event.reaction
          ? [
              {
                threadId: event.sender.id,
                messageId: event.reaction.mid,
                author: { externalId: event.sender.id },
                emojis:
                  event.reaction.action === 'react' && event.reaction.emoji
                    ? [event.reaction.emoji]
                    : [],
              },
            ]
          : [],
      ),
    };
  },
};
