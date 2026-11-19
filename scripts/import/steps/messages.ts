// Every provider's messages go to `frontline_messages`. Old erxes kept a provider's messages in
// two places: Facebook and Instagram threads whole in their own collections, with the members'
// replies copied into `conversation_messages`; Discord, Telegram and the messenger in
// `conversation_messages`. Each message is copied once, from the place that has it whole, with
// the provider's message id as `external_id`.
import type { Document } from 'mongodb';
import { writtenText } from '../../../api/src/modules/inbox/html.ts';
import type { Context } from '../context.ts';
import { put, type Put, skip } from '../engine.ts';
import type { Step } from '../step.ts';
import {
  createdOf,
  entriesOf,
  filesOf,
  idOf,
  idsOf,
  isHtml,
  plain,
  textOf,
  textOfHtml,
  docId,
} from '../values.ts';
import { already } from './structure.ts';

/** Kinds whose replies went to a provider: an imported member reply there was sent. */
const SENT_KINDS = new Set(['facebook', 'instagram', 'telegram', 'discord', 'mail']);

type Message = {
  id: string;
  conversationId: string;
  text: unknown;
  attachments?: unknown;
  internal?: boolean;
  customerId?: string | null;
  userId?: string | null;
  mentionedUserIds?: string[];
  externalId?: string | null;
  providerData?: Record<string, unknown> | null;
  created: unknown;
};

/** A member's rich text as the inbox keeps it; text too long for the editor stays plain. */
const memberText = (raw: string) => {
  if (!isHtml(raw)) return { content: raw, html: null };

  try {
    const { content, html } = writtenText({ content: '', html: raw });

    return { content, html };
  } catch {
    return { content: textOfHtml(raw) ?? '', html: null };
  }
};

/** The row of one message, or why it has no conversation to go to. */
const messageOf = (ctx: Context, message: Message): Put | string => {
  const conversation = ctx.conversations.get(message.conversationId);

  if (!conversation) return 'its conversation is not imported';

  const userId = ctx.user(message.userId ?? null);
  const customerId = userId ? null : ctx.customer(message.customerId ?? null);
  const raw = textOf(message.text) ?? '';

  const { content, html } = userId
    ? memberText(raw)
    : { content: textOfHtml(raw) ?? '', html: null };

  const created = createdOf({ _id: message.id }, message.created);
  const sent = userId && !message.internal && SENT_KINDS.has(conversation.kind);

  return [
    'frontline_messages',
    {
      id: message.id,
      conversation_id: message.conversationId,
      content,
      html,
      attachments: filesOf(message.attachments),
      internal: message.internal ?? false,
      customer_id: customerId,
      user_id: userId,
      mentioned_user_ids: ctx.users(message.mentionedUserIds ?? []),
      external_id: message.externalId ?? null,
      delivery_status: sent ? 'sent' : null,
      provider_data: message.providerData ?? null,
      created_at: created,
      queued_at: created,
    },
  ];
};

const one = (ctx: Context, message: Message) => {
  const row = messageOf(ctx, message);

  return typeof row === 'string' ? skip(row) : put(row);
};

/** The main conversation of each Facebook and Instagram thread record, by the record's id. */
const metaThreads = new Map<string, string>();

/** The conversation of each Facebook or Instagram comment, by the provider's comment id. */
const commentConversations = new Map<string, string>();

/** The members' replies the provider copies hold: `conversation|member|text` and when. */
const providerReplies = new Map<string, number[]>();

const replyKey = (conversationId: string, userId: string, text: unknown) =>
  `${conversationId}|${userId}|${textOfHtml(text) ?? ''}`;

const loadMetaThreads = async (ctx: Context) => {
  for (const db of [ctx.main, ctx.officeIntegrations])
    for (const collection of [
      'conversations_facebooks',
      'instagram_conversations',
      'conversations_discords',
    ])
      for await (const doc of db
        .collection(collection)
        .find({}, { projection: { erxesApiId: 1 } })) {
        const id = docId(doc);
        const conversationId = idOf(doc.erxesApiId);

        if (id && conversationId) metaThreads.set(id, conversationId);
      }
};

/** Messenger and Instagram direct messages, as the provider records kept them. */
const metaMessagesStep = (db: 'erxes' | 'erxes_office_integrations', collection: string): Step => ({
  source: `${db}.${collection}`,
  documents: async (ctx) => {
    if (metaThreads.size === 0) await loadMetaThreads(ctx);

    return ctx.find(db === 'erxes' ? ctx.main : ctx.officeIntegrations, collection);
  },
  transform: (doc, ctx) => {
    const id = docId(doc);
    const conversationId = metaThreads.get(idOf(doc.conversationId) ?? '');

    if (!id || !conversationId) return skip('its thread is not in the old data');

    const userId = idOf(doc.userId);

    if (userId) {
      const key = replyKey(conversationId, userId, doc.content);
      const time = createdOf(doc, doc.createdAt)?.getTime() ?? 0;

      providerReplies.set(key, [...(providerReplies.get(key) ?? []), time]);
    }

    return one(ctx, {
      id,
      conversationId,
      text: doc.content,
      attachments: doc.attachments,
      internal: doc.internal === true,
      customerId: idOf(doc.customerId),
      userId,
      externalId: textOf(doc.mid),
      created: doc.createdAt,
    });
  },
});

/** Comments on posts: each is the message, its comment id the provider's message id. */
const commentStep = (db: 'erxes' | 'erxes_office_integrations', collection: string): Step => ({
  source: `${db}.${collection}`,
  documents: (ctx) => ctx.find(db === 'erxes' ? ctx.main : ctx.officeIntegrations, collection),
  transform: (doc, ctx) => {
    const id = docId(doc);
    const conversationId = idOf(doc.erxesApiId);
    const commentId = idOf(doc.comment_id);

    if (!id || !conversationId) return skip('its conversation is not in the old data');

    if (commentId) commentConversations.set(commentId, conversationId);

    return one(ctx, {
      id,
      conversationId,
      text: doc.content,
      attachments: doc.attachments,
      customerId: idOf(doc.customerId),
      externalId: commentId,
      providerData: { postId: idOf(doc.postId) },
      created: doc.createdAt,
    });
  },
});

/** Replies under a comment, by the page or by people: they join the comment's conversation. */
const commentReplyStep = (db: 'erxes' | 'erxes_office_integrations', collection: string): Step => ({
  source: `${db}.${collection}`,
  documents: (ctx) => ctx.find(db === 'erxes' ? ctx.main : ctx.officeIntegrations, collection),
  transform: (doc, ctx) => {
    const id = docId(doc);
    const conversationId = commentConversations.get(idOf(doc.parentId) ?? '');

    if (!id || !conversationId) return skip('the comment it answers is not imported');

    return one(ctx, {
      id,
      conversationId,
      text: doc.content,
      attachments: doc.attachments,
      customerId: idOf(doc.customerId),
      userId: idOf(doc.userId),
      externalId: idOf(doc.comment_id),
      created: doc.createdAt,
    });
  },
});

/** Discord messages `conversation_messages` has under their Discord id. */
const mainDiscordIds = new Set<string>();

const discordStep: Step = {
  source: 'erxes.conversation_messages_discords',
  documents: async (ctx) => {
    for await (const doc of ctx.main
      .collection('conversation_messages')
      .find({ 'extraData.discordMessageId': { $exists: true } }, { projection: { extraData: 1 } }))
      mainDiscordIds.add(String(entriesOf(doc.extraData).get('discordMessageId')));

    if (metaThreads.size === 0) await loadMetaThreads(ctx);

    return ctx.find(ctx.main, 'conversation_messages_discords');
  },
  transform: (doc, ctx) => {
    const id = docId(doc);
    const messageId = idOf(doc.messageId);
    const conversationId = metaThreads.get(idOf(doc.conversationId) ?? '');

    if (!id || !conversationId) return skip('its thread is not in the old data');

    if (messageId && mainDiscordIds.has(messageId))
      return skip('copied from conversation_messages');

    return one(ctx, {
      id,
      conversationId,
      text: doc.content,
      attachments: doc.attachments,
      customerId: idOf(doc.customerId),
      userId: idOf(doc.userId),
      externalId: messageId,
      created: doc.createdAt,
    });
  },
};

const addressesOf = (value: unknown) =>
  (Array.isArray(value) ? value : []).map((item: unknown) => plain(item));

/** Mail through Cloudflare routing or IMAP: the customer's mail and the team's replies. */
const mailStep = (collection: 'mail_messages' | 'imap_messages'): Step => ({
  source: `erxes.${collection}`,
  documents: (ctx) => ctx.find(ctx.main, collection),
  transform: (doc, ctx) => {
    const id = docId(doc);
    const conversationId = idOf(doc.inboxConversationId);

    if (!id || !conversationId) return skip('no conversation');

    const conversation = ctx.conversations.get(conversationId);
    const fromCustomer = doc.type !== 'SENT';
    const subject = textOf(doc.subject);
    const body = textOfHtml(doc.body) ?? '';

    return one(ctx, {
      id,
      conversationId,
      text: subject && fromCustomer ? `${subject}\n\n${body}` : body,
      attachments: doc.attachments,
      customerId: fromCustomer ? (conversation?.customerId ?? null) : null,
      externalId: textOf(doc.messageId),
      providerData: {
        subject,
        from: addressesOf(doc.from),
        to: addressesOf(doc.to),
        cc: addressesOf(doc.cc),
        references: idsOf(doc.references),
        inReplyTo: textOf(doc.inReplyTo),
      },
      created: doc.createdAt,
    });
  },
});

/** Nylas mail in the old integrations copy, under the main message's id where it had one. */
const nylasStep = (collection: string, conversations: string): Step => {
  const nylasThreads = new Map<string, string>();

  return {
    source: `erxes_office_integrations.${collection}`,
    documents: async (ctx) => {
      for await (const doc of ctx.officeIntegrations
        .collection(conversations)
        .find({}, { projection: { erxesApiId: 1 } }))
        nylasThreads.set(String(docId(doc)), String(idOf(doc.erxesApiId)));

      return ctx.find(ctx.officeIntegrations, collection);
    },
    transform: (doc, ctx) => {
      const id = idOf(doc.erxesApiMessageId) ?? docId(doc);

      const conversationId =
        nylasThreads.get(idOf(doc.conversationId) ?? '') ?? idOf(doc.conversationId);

      if (!id || !conversationId) return skip('no conversation');

      return one(ctx, {
        id,
        conversationId,
        text: textOf(doc.subject)
          ? `${String(doc.subject)}\n\n${textOfHtml(doc.body) ?? ''}`
          : doc.body,
        attachments: doc.attachments,
        customerId: idOf(doc.customerId),
        externalId: textOf(doc.messageId),
        providerData: {
          subject: textOf(doc.subject),
          from: addressesOf(doc.from),
          to: addressesOf(doc.to),
        },
        created: fromSeconds(doc.date) ?? doc.createdAt,
      });
    },
  };
};

/** Nylas kept a message's date as Unix seconds. */
const fromSeconds = (seconds: unknown) => {
  const value = Number(seconds);

  return Number.isFinite(value) && value > 0 ? new Date(value * 1000) : null;
};

/** Telegram's ids for the messages `conversation_messages` has, by the main message id. */
const telegramIds = new Map<string, string>();

const loadTelegramIds = async (ctx: Context) => {
  for await (const doc of ctx.main.collection('conversation_messages_telegrams').find()) {
    const id = idOf(doc.erxesApiId);
    const chatId = idOf(doc.chatId);
    const messageId = idOf(doc.messageId);

    if (id && chatId && messageId) telegramIds.set(id, `${chatId}:${messageId}`);
  }
};

/** Whether a Facebook or Instagram member reply is the copy of one its thread record has. */
const isProviderCopy = (doc: Document, conversationId: string) => {
  const userId = idOf(doc.userId);

  if (!userId) return false;

  const time = createdOf(doc, doc.createdAt)?.getTime() ?? 0;
  const times = providerReplies.get(replyKey(conversationId, userId, doc.content)) ?? [];

  return times.some((other) => Math.abs(other - time) < 60_000);
};

const mainMessagesStep = (database: 'erxes' | 'erxes_office'): Step => ({
  source: `${database}.conversation_messages`,
  documents: async (ctx) => {
    if (telegramIds.size === 0) await loadTelegramIds(ctx);

    return ctx.find(database === 'erxes' ? ctx.main : ctx.office, 'conversation_messages');
  },
  transform: (doc, ctx) => {
    const id = docId(doc);
    const conversationId = idOf(doc.conversationId);

    if (!id || !conversationId) return skip('no conversation');

    if (already(ctx, 'message', id)) return skip('already in erxes by id');

    const kind = ctx.conversations.get(conversationId)?.kind;

    if ((kind === 'facebook' || kind === 'instagram') && isProviderCopy(doc, conversationId))
      return skip(`copy of a reply the ${kind} thread record holds`);

    ctx.remember('message', id, id);

    return one(ctx, {
      id,
      conversationId,
      text: doc.content,
      attachments: doc.attachments,
      internal: doc.internal === true,
      customerId: idOf(doc.customerId),
      userId: idOf(doc.userId),
      mentionedUserIds: idsOf(doc.mentionedUserIds),
      externalId: telegramIds.get(id) ?? idOf(entriesOf(doc.extraData).get('discordMessageId')),
      created: doc.createdAt,
    });
  },
});

export const MESSAGE_STEPS: Step[] = [
  metaMessagesStep('erxes', 'conversation_messages_facebooks'),
  metaMessagesStep('erxes_office_integrations', 'conversation_messages_facebooks'),
  metaMessagesStep('erxes', 'instagram_conversation_messages'),
  metaMessagesStep('erxes_office_integrations', 'instagram_conversation_messages'),
  commentStep('erxes', 'comment_conversations_facebooks'),
  commentStep('erxes_office_integrations', 'comment_conversations_facebooks'),
  commentStep('erxes', 'instagram_comment_conversations'),
  commentStep('erxes_office_integrations', 'instagram_comment_conversations'),
  commentReplyStep('erxes', 'comment_conversations_reply_facebooks'),
  commentReplyStep('erxes_office_integrations', 'comment_conversations_reply_facebooks'),
  commentReplyStep('erxes_office_integrations', 'instagram_conversations_reply_facebooks'),
  discordStep,
  mailStep('mail_messages'),
  mailStep('imap_messages'),
  nylasStep('conversation_messages_nylas_imaps', 'conversations_nylas_imaps'),
  nylasStep('conversation_messages_nylas_gmails', 'conversations_nylas_gmails'),
  nylasStep('conversation_messages_gmails', 'conversations_gmails'),
  mainMessagesStep('erxes'),
  mainMessagesStep('erxes_office'),
];
