import { z } from 'zod';
import { downloadFile, FileRefused } from '#/modules/files.ts';
import {
  AccountRefused,
  type InboundFile,
  type InboundMessage,
  type InboundReaction,
  type WebhookSource,
} from '../provider.ts';
import { sameText } from '../secrets.ts';
import { call, Message, telegram, TelegramRefused, User } from './telegram.ts';

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

/**
 * A file's bytes, through the address Telegram gives the bot for it. Its link holds the token. A
 * file Telegram won't give, such as one over the 20 MB bots may fetch, is `FileRefused`.
 */
const download = async (token: string, fileId: string) => {
  const { file_path: path } = await call(token, 'getFile', FilePath, { file_id: fileId }).catch(
    (error: unknown) => {
      // A revoked token keeps the message too; the inbox marks the bot broken from the cause.
      throw error instanceof TelegramRefused || error instanceof AccountRefused
        ? new FileRefused(error.message, { cause: error })
        : error;
    },
  );

  return (
    await downloadFile(`https://api.telegram.org/file/bot${token}/${path}`, 'Telegram')
  ).bytes();
};

/** The file a sticker is: a picture, an animation or a video. */
const stickerFile = (sticker: NonNullable<z.infer<typeof Message>['sticker']>) =>
  sticker.is_video
    ? ([sticker, 'sticker.webm', 'video/webm'] as const)
    : sticker.is_animated
      ? ([sticker, 'sticker.tgs', 'application/x-tgsticker'] as const)
      : ([sticker, 'sticker.webp', 'image/webp'] as const);

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
      ...(message.sticker ? [stickerFile(message.sticker)] : []),
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

/** What `message` says: its text or caption, or what a sticker, location or contact is. */
const textOf = ({ text, caption, sticker, location, contact }: z.infer<typeof Message>) => {
  if (text ?? caption) return text ?? caption ?? '';

  if (sticker) return `Sticker ${sticker.emoji ?? ''}`.trim();

  if (location)
    return `Location: https://maps.google.com/?q=${location.latitude},${location.longitude}`;

  if (contact)
    return `Contact: ${[contact.first_name, contact.last_name].filter(Boolean).join(' ')}, ${contact.phone_number}`;

  return '';
};

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
      text: textOf(message),
      attachments: [],
      files: filesOf(token, message),
      quotedId:
        message.reply_to_message && `${message.chat.id}:${message.reply_to_message.message_id}`,
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
