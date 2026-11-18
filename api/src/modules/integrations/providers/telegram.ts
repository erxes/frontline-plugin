import { randomBytes } from 'node:crypto';
import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { config } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { readsWithCore, writesWithCore } from '#/orpc.ts';
import { Account, accountRow, saveAccount } from '../store.ts';
import {
  defineProvider,
  type InboundFile,
  type InboundMessage,
  type InboundReaction,
  inOrder,
  type WebhookSource,
} from '../provider.ts';
import { attachedFile } from '#/modules/files.ts';
import { sameText } from '../secrets.ts';

const Config = z.object({ username: z.string() });

const Secret = z.object({
  token: z.string(),
  /** Telegram sends it back in `X-Telegram-Bot-Api-Secret-Token` on every update. */
  webhookSecret: z.string(),
});

/** The parts of the Bot API's objects frontline reads. */
const User = z.object({
  id: z.number(),
  is_bot: z.boolean(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
});

/** A file in a message, by the id the bot fetches it with. */
const TelegramFile = z.object({
  file_id: z.string(),
  file_name: z.string().optional(),
  mime_type: z.string().optional(),
});

const Message = z.object({
  message_id: z.number(),
  date: z.number(),
  chat: z.object({ id: z.number(), type: z.string(), title: z.string().optional() }),
  from: User.optional(),
  text: z.string().optional(),
  caption: z.string().optional(),
  /** One photo in sizes, smallest first. */
  photo: z.array(TelegramFile).optional(),
  document: TelegramFile.optional(),
  video: TelegramFile.optional(),
  audio: TelegramFile.optional(),
  voice: TelegramFile.optional(),
  video_note: TelegramFile.optional(),
});

/** The photo types Telegram shows as a photo; it sends any other file as a document. */
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** The most text Telegram takes as a file's caption. */
const CAPTION_CHARS = 1024;

const Answer = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({ ok: z.literal(false), description: z.string() }),
]);

/**
 * One Bot API method as the bot, its result read through `Result`, or Telegram's refusal. A form
 * carries files; it gets longer, since its bytes go up in the one request.
 */
const call = async <T>(
  token: string,
  method: string,
  Result: z.ZodType<T>,
  params: Record<string, unknown> | FormData = {},
) => {
  const form = params instanceof FormData;

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    ...(form
      ? { body: params }
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(params) }),
    signal: AbortSignal.timeout((form ? 4 : 1) * config.outboundMs),
  });

  const answer = Answer.parse(await response.json());

  if (!answer.ok) throw new Error(answer.description);

  return Result.parse(answer.result);
};

const why = (error: unknown) => (error instanceof Error ? error.message : 'Telegram failed');

/** Has Telegram post the bot's updates to its address under `key`, signed with `secret`. */
const setWebhook = (token: string, key: string, secret: string) =>
  call(token, 'setWebhook', z.boolean(), {
    url: `${config.publicUrl}/api/public/webhooks/telegram/${key}`,
    secret_token: secret,
    allowed_updates: ['message', 'message_reaction'],
  });

export const telegram = defineProvider({
  name: 'telegram',
  Config,
  Secret,
  check: async ({ secret }) => call(secret.token, 'getMe', User).then(() => null, why),
  // Each file goes as a message of its own, the text as the first one's caption when it fits.
  // Every file is read before anything goes out, so one core can't give fails the whole reply.
  send: async ({ row, secret }, message) => {
    const files = await Promise.all(
      message.attachments.map((file) => attachedFile(row.orgId, file)),
    );

    const captioned = files.length > 0 && message.text.length <= CAPTION_CHARS;

    const sends = [
      ...(message.text && !captioned
        ? [
            () =>
              call(secret.token, 'sendMessage', Message, {
                chat_id: message.threadId,
                text: message.text,
              }),
          ]
        : []),
      ...files.map((file, index) => () => {
        const photo = PHOTO_TYPES.has(file.type);
        const form = new FormData();

        form.set('chat_id', message.threadId);
        form.set(photo ? 'photo' : 'document', file);

        if (captioned && index === 0 && message.text) form.set('caption', message.text);

        return call(secret.token, photo ? 'sendPhoto' : 'sendDocument', Message, form);
      }),
    ];

    const [first] = await inOrder(sends, (send) => send());

    if (!first) throw new Error('A reply needs text or a file');

    return `${first.chat.id}:${first.message_id}`;
  },
  // A bot keeps one reaction on a message: the team's latest. Telegram's emoji carry no U+FE0F.
  react: async ({ secret }, { threadId, message, emojis }) => {
    const latest = emojis.at(-1)?.replaceAll('️', '');

    await call(secret.token, 'setMessageReaction', z.boolean(), {
      chat_id: threadId,
      message_id: Number(message.externalId.split(':').at(-1)),
      reaction: latest ? [{ type: 'emoji', emoji: latest }] : [],
    });
  },
  disconnect: async ({ secret }) => {
    await call(secret.token, 'deleteWebhook', z.boolean());
  },
  repair: async ({ secret }, webhookKey) => {
    if (!webhookKey) throw new Error('The bot has no webhook address: connect it again');

    await setWebhook(secret.token, webhookKey, secret.webhookSecret);
  },
});

/** A reaction type: an emoji, or a custom or paid one frontline can't show. */
const Reaction = z.looseObject({ type: z.string(), emoji: z.string().optional() });

/** A person changed their reactions on a message; `new_reaction` is all of theirs now. */
const MessageReaction = z.object({
  chat: z.object({ id: z.number() }),
  message_id: z.number(),
  user: User.optional(),
  new_reaction: z.array(Reaction),
});

const Update = z.object({
  update_id: z.number(),
  message: Message.optional(),
  message_reaction: MessageReaction.optional(),
});

/** A person's reactions as the inbox keeps them, in the chat's conversation; none from a bot. */
const reactionOf = (changed: z.infer<typeof MessageReaction>): InboundReaction[] =>
  changed.user?.is_bot
    ? []
    : [
        {
          threadId: String(changed.chat.id),
          messageId: `${changed.chat.id}:${changed.message_id}`,
          author: { externalId: String(changed.chat.id) },
          emojis: changed.new_reaction.flatMap((reaction) => reaction.emoji ?? []),
        },
      ];

const FilePath = z.object({ file_path: z.string() });

/** A file's bytes, through the address Telegram gives the bot for it. Its link holds the token. */
const download = async (token: string, fileId: string) => {
  const { file_path: path } = await call(token, 'getFile', FilePath, { file_id: fileId });

  const response = await fetch(`https://api.telegram.org/file/bot${token}/${path}`, {
    signal: AbortSignal.timeout(4 * config.outboundMs),
  });

  if (!response.ok) throw new Error(`Telegram did not send the file: ${response.status}`);

  return new Uint8Array(await response.arrayBuffer());
};

/** The files in `message`, the photo at its largest, each named and typed when Telegram doesn't. */
const filesOf = (token: string, message: z.infer<typeof Message>): InboundFile[] =>
  (
    [
      [message.photo?.at(-1), 'photo.jpg', 'image/jpeg'],
      [message.document, 'file', 'application/octet-stream'],
      [message.video, 'video.mp4', 'video/mp4'],
      [message.audio, 'audio.mp3', 'audio/mpeg'],
      [message.voice, 'voice.ogg', 'audio/ogg'],
      [message.video_note, 'video.mp4', 'video/mp4'],
    ] as const
  ).flatMap(([file, name, contentType]) =>
    file
      ? [
          {
            name: file.file_name ?? name,
            contentType: file.mime_type ?? contentType,
            bytes: () => download(token, file.file_id),
          },
        ]
      : [],
  );

/**
 * A chat's message as the inbox reads it, or none from a bot. The customer is the chat: a person
 * in a private chat, the group in a group, so a group is one conversation.
 */
const inboundOf = (token: string, message: z.infer<typeof Message>): InboundMessage[] => {
  const author = message.from;

  if (author?.is_bot) return [];

  const person = [author?.first_name, author?.last_name].filter(Boolean).join(' ');

  return [
    {
      threadId: String(message.chat.id),
      messageId: `${message.chat.id}:${message.message_id}`,
      author: {
        externalId: String(message.chat.id),
        name: message.chat.type === 'private' ? person : (message.chat.title ?? person),
      },
      text: message.text ?? message.caption ?? '',
      attachments: [],
      files: filesOf(token, message),
    },
  ];
};

/** Telegram posts each bot's updates to the address with the key frontline gave it. */
export const telegramWebhook: WebhookSource = {
  route: ({ key, body }) => (key ? [{ provider: 'telegram', key, events: [body] }] : null),
  receive: (row, events, { headers }) => {
    const { account } = telegram.open(row);

    if (!sameText(account.secret.webhookSecret, headers['x-telegram-bot-api-secret-token']))
      return null;

    const updates = events.map((event) => Update.parse(event));

    return {
      messages: updates.flatMap(({ message }) =>
        message ? inboundOf(account.secret.token, message) : [],
      ),
      reactions: updates.flatMap(({ message_reaction: changed }) =>
        changed ? reactionOf(changed) : [],
      ),
    };
  },
};

/**
 * Connects a bot by its token from BotFather: Telegram checks the token, then posts the bot's
 * updates to a webhook address only frontline knows, signed with a secret of its own. Telegram
 * is asked before the transaction opens.
 */
const connect = writesWithCore(
  PERMISSIONS.integrationManage,
  z.object({ token: z.string().trim().min(10).max(200) }),
  async (_member, input) => {
    const bot = await call(input.token, 'getMe', User).catch((error: unknown) => {
      throw new ORPCError('BAD_REQUEST', { message: `Telegram refused the token: ${why(error)}` });
    });

    const key = randomBytes(24).toString('base64url');
    const webhookSecret = randomBytes(32).toString('base64url');

    await setWebhook(input.token, key, webhookSecret);

    return { bot, key, webhookSecret };
  },
)
  .output(Account)
  .handler(
    ({
      input,
      context: {
        tx,
        member,
        fromCore: { bot, key, webhookSecret },
      },
    }) =>
      saveAccount(tx, member, {
        provider: 'telegram',
        externalId: String(bot.id),
        name: bot.username ? `@${bot.username}` : bot.first_name,
        config: { username: bot.username },
        secret: { token: input.token, webhookSecret },
        webhookKey: key,
      }),
  );

/** A bot's webhook: where updates go, how many wait, and its last failure. */
const Webhook = z.object({
  url: z.string(),
  hasCustomCertificate: z.boolean(),
  pendingUpdateCount: z.number().int(),
  ipAddress: z.string().nullable(),
  lastErrorAt: z.date().nullable(),
  lastErrorMessage: z.string().nullable(),
  maxConnections: z.number().int().nullable(),
  allowedUpdates: z.array(z.string()),
});

/** Telegram's `WebhookInfo`, read as `Webhook`. */
const WebhookInfo = z
  .object({
    url: z.string(),
    has_custom_certificate: z.boolean(),
    pending_update_count: z.number().int(),
    ip_address: z.string().optional(),
    last_error_date: z.number().optional(),
    last_error_message: z.string().optional(),
    max_connections: z.number().int().optional(),
    allowed_updates: z.array(z.string()).optional(),
  })
  .transform((info) => ({
    url: info.url,
    hasCustomCertificate: info.has_custom_certificate,
    pendingUpdateCount: info.pending_update_count,
    ipAddress: info.ip_address ?? null,
    lastErrorAt: info.last_error_date ? new Date(info.last_error_date * 1000) : null,
    lastErrorMessage: info.last_error_message ?? null,
    maxConnections: info.max_connections ?? null,
    allowedUpdates: info.allowed_updates ?? [],
  }));

/** The bot's webhook as Telegram sees it, to tell why updates stopped arriving. */
const webhookInfo = readsWithCore(
  PERMISSIONS.integrationView,
  z.object({ id: z.string() }),
  async (member, input) => {
    const row = await withOrg(member.orgId, (tx) => accountRow(tx, input.id));

    if (row.provider !== 'telegram')
      throw new ORPCError('NOT_FOUND', { message: 'No such Telegram bot' });

    const { account } = telegram.open(row);

    return call(account.secret.token, 'getWebhookInfo', WebhookInfo).catch((error: unknown) => {
      throw new ORPCError('BAD_GATEWAY', { message: `Telegram refused: ${why(error)}` });
    });
  },
)
  .output(Webhook)
  .handler(({ context: { fromCore } }) => fromCore);

export const telegramProcedures = { connect, webhookInfo };
