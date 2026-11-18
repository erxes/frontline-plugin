import { randomBytes } from 'node:crypto';
import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { config } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { attachedFile } from '#/modules/files.ts';
import { readsWithCore, writesWithCore } from '#/orpc.ts';
import { AccountRefused, defineProvider, sendInParts } from '../provider.ts';
import { Account, accountRow, checkInto, Into, intoChannel, saveAccount } from '../store.ts';

const Config = z.object({ username: z.string() });

const Secret = z.object({
  token: z.string(),
  /** Telegram sends it back in `X-Telegram-Bot-Api-Secret-Token` on every update. */
  webhookSecret: z.string(),
});

/** The parts of the Bot API's objects frontline reads. */
export const User = z.object({
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

export const Message = z.object({
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
  sticker: TelegramFile.extend({
    emoji: z.string().optional(),
    is_animated: z.boolean(),
    is_video: z.boolean(),
  }).optional(),
  location: z.object({ latitude: z.number(), longitude: z.number() }).optional(),
  contact: z
    .object({ phone_number: z.string(), first_name: z.string(), last_name: z.string().optional() })
    .optional(),
});

/** The photo types Telegram shows as a photo, up to `PHOTO_BYTES`. */
const PHOTO_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/** The biggest photo `sendPhoto` takes; a bigger one goes as a document. */
const PHOTO_BYTES = 10 * 1024 * 1024;

/** The method and field that send a file of each type as Telegram plays it; others go as documents. */
const MEDIA: Record<string, { method: string; field: string }> = {
  'image/gif': { method: 'sendAnimation', field: 'animation' },
  'video/mp4': { method: 'sendVideo', field: 'video' },
  'audio/mpeg': { method: 'sendAudio', field: 'audio' },
  'audio/ogg': { method: 'sendVoice', field: 'voice' },
};

const mediaOf = (file: File) =>
  PHOTO_TYPES.has(file.type) && file.size <= PHOTO_BYTES
    ? { method: 'sendPhoto', field: 'photo' }
    : (MEDIA[file.type] ?? { method: 'sendDocument', field: 'document' });

/** The most text Telegram takes as a file's caption. */
const CAPTION_CHARS = 1024;

const Answer = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), result: z.unknown() }),
  z.object({ ok: z.literal(false), error_code: z.number(), description: z.string() }),
]);

/**
 * One Bot API method as the bot, its result read through `Result`, or Telegram's refusal. A form
 * carries files; it gets longer, since its bytes go up in the one request.
 */
export const call = async <T>(
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

  if (!answer.ok)
    throw answer.error_code === 401
      ? new AccountRefused(answer.description)
      : new TelegramRefused(answer.description);

  return Result.parse(answer.result);
};

/** Telegram's answer that it won't do what the bot asked, such as fetch a file too big for bots. */
export class TelegramRefused extends Error {}

const why = (error: unknown) => (error instanceof Error ? error.message : 'Telegram failed');

/** A message's id in its chat, from the `chat:message` id the inbox keeps. */
const messageIdOf = (externalId: string) => Number(externalId.split(':').at(-1));

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
  // Every file is read before anything goes out, so one core can't give fails the whole reply,
  // and a retry sends only the parts Telegram didn't take. The first part quotes the message the
  // member answers; a quoted message that is gone sends the reply on its own.
  send: async ({ row, secret }, message) => {
    const files = await Promise.all(
      message.attachments.map((file) => attachedFile(row.orgId, file)),
    );

    const captioned = files.length > 0 && message.text.length <= CAPTION_CHARS;

    // null is the text.
    const parts = [...(message.text && !captioned ? [null] : []), ...files];

    const reply = message.quotedId && {
      message_id: messageIdOf(message.quotedId),
      allow_sending_without_reply: true,
    };

    const [first] = await sendInParts(message.parts, parts, async (file) => {
      const quote = file === parts[0] && reply ? reply : null;

      if (!file) {
        const sent = await call(secret.token, 'sendMessage', Message, {
          chat_id: message.threadId,
          text: message.text,
          ...(quote && { reply_parameters: quote }),
        });

        return `${sent.chat.id}:${sent.message_id}`;
      }

      const { method, field } = mediaOf(file);
      const form = new FormData();

      form.set('chat_id', message.threadId);
      form.set(field, file);

      if (captioned && file === files[0] && message.text) form.set('caption', message.text);

      if (quote) form.set('reply_parameters', JSON.stringify(quote));

      const sent = await call(secret.token, method, Message, form);

      return `${sent.chat.id}:${sent.message_id}`;
    });

    if (!first) throw new Error('A reply needs text or a file');

    return first;
  },
  // A bot keeps one reaction on a message: the team's latest. Telegram's emoji carry no U+FE0F.
  react: async ({ secret }, { threadId, message, emojis }) => {
    const latest = emojis.at(-1)?.replaceAll('️', '');

    await call(secret.token, 'setMessageReaction', z.boolean(), {
      chat_id: threadId,
      message_id: messageIdOf(message.externalId),
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

/**
 * Connects a bot by its token from BotFather: Telegram checks the token, then posts the bot's
 * updates to a webhook address only frontline knows, signed with a secret of its own. Telegram
 * is asked before the transaction opens, once the channel it joins is checked, so a refusal
 * leaves a connected bot's webhook where it was.
 */
const connect = writesWithCore(
  PERMISSIONS.integrationManage,
  z.object({ token: z.string().trim().min(10).max(200), ...Into }),
  async (member, input) => {
    await checkInto(member, input.channelId);

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
    async ({
      input,
      context: {
        tx,
        member,
        fromCore: { bot, key, webhookSecret },
      },
    }) =>
      saveAccount(
        tx,
        member,
        {
          provider: 'telegram',
          externalId: String(bot.id),
          name: bot.username ? `@${bot.username}` : bot.first_name,
          config: { username: bot.username },
          secret: { token: input.token, webhookSecret },
          webhookKey: key,
        },
        await intoChannel(tx, member, input.channelId),
      ),
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
