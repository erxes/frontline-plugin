import type { CustomValue } from '@erxes/core-contract';
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { channels } from './schema.ts';
import { tags } from './tags.ts';
import { type StoredFile, id, stamps, table } from './table.ts';

/**
 * Where a channel's conversations come from: a messenger on a website, a Facebook page, a
 * mailbox. `kind` names the adapter that sends and receives its messages
 * (`api/src/modules/inbox/adapters.ts`), and `config` is that adapter's settings, parsed by its
 * schema. Secrets live encrypted in the adapter's own tables, never here. Deleting the channel
 * deletes its integrations; moving one to another channel takes its conversations along.
 */
export const integrations = table(
  'integrations',
  {
    id: id(),
    orgId: text().notNull(),
    channelId: text().notNull(),
    kind: text().notNull(),
    name: text().notNull(),
    isActive: boolean().notNull().default(true),
    config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    ...stamps(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_integrations_channel_fkey',
      columns: [t.orgId, t.channelId],
      foreignColumns: [channels.orgId, channels.id],
    }).onDelete('cascade'),
    unique('frontline_integrations_org_id_key').on(t.orgId, t.id),
    // What a conversation's foreign key names, so a conversation's channel is always its integration's.
    unique('frontline_integrations_org_channel_id_key').on(t.orgId, t.channelId, t.id),
    index('frontline_integrations_org_channel_idx').on(t.orgId, t.channelId),
  ],
);

export const CONVERSATION_STATUSES = ['new', 'open', 'resolved'] as const;

/** Who answers a conversation: automations while `bot`, only members once a `person` took it. */
export const CONVERSATION_OPERATORS = ['bot', 'person'] as const;

/**
 * One thread with one customer through one integration, whatever its kind. `externalId` is the
 * provider's thread id, so a webhook finds its conversation; the messenger has none. A new
 * message from the customer clears `readBy` and reopens a resolved conversation.
 */
export const conversations = table(
  'conversations',
  {
    id: id(),
    orgId: text().notNull(),
    channelId: text().notNull(),
    integrationId: text().notNull(),
    /** A core customer id, found or made through `customerLinks`. */
    customerId: text().notNull(),
    externalId: text(),
    status: text({ enum: CONVERSATION_STATUSES }).notNull().default('new'),
    operator: text({ enum: CONVERSATION_OPERATORS }).notNull().default('bot'),
    /** A core user id. */
    assigneeId: text(),
    /** The members who wrote in it. */
    participantIds: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** The members its messages mention, for the Mentions queue and filter. */
    mentionedUserIds: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** The members who read it since the customer last wrote. */
    readBy: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** The last message's text, for the list. */
    content: text().notNull().default(''),
    messageCount: integer().notNull().default(0),
    /** Whether the customer wrote last, so the conversation waits on a reply. */
    customerRespondedLast: boolean().notNull().default(true),
    lastMessageAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    firstRespondedAt: timestamp({ withTimezone: true }),
    firstRespondedBy: text(),
    resolvedAt: timestamp({ withTimezone: true }),
    resolvedBy: text(),
    /** Values of the custom fields core keeps for `frontline.conversation`, by field id. */
    propertiesData: jsonb().$type<Record<string, CustomValue>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      name: 'frontline_conversations_integration_fkey',
      columns: [t.orgId, t.channelId, t.integrationId],
      foreignColumns: [integrations.orgId, integrations.channelId, integrations.id],
    })
      .onDelete('cascade')
      .onUpdate('cascade'),
    unique('frontline_conversations_org_id_key').on(t.orgId, t.id),
    uniqueIndex('frontline_conversations_org_integration_external_key').on(
      t.orgId,
      t.integrationId,
      t.externalId,
    ),
    // The list's order, across the caller's channels, read backward for newest first.
    index('frontline_conversations_org_last_message_idx').on(t.orgId, t.lastMessageAt, t.id),
    // The default list's, which hides resolved ones: its first page reads 51 rows, not every
    // open one.
    index('frontline_conversations_org_open_last_message_idx')
      .on(t.orgId, t.lastMessageAt, t.id)
      .where(sql`${t.status} <> 'resolved'`),
    index('frontline_conversations_org_channel_status_idx').on(t.orgId, t.channelId, t.status),
    // The sidebar's unread counts, which only open conversations make.
    index('frontline_conversations_org_channel_open_idx')
      .on(t.orgId, t.channelId)
      .where(sql`${t.status} <> 'resolved'`),
    index('frontline_conversations_org_customer_idx').on(t.orgId, t.customerId),
    index('frontline_conversations_org_assignee_idx').on(t.orgId, t.assigneeId),
    // Reports count the conversations started in a period.
    index('frontline_conversations_org_created_idx').on(t.orgId, t.createdAt),
    index('frontline_conversations_mentioned_user_ids_idx').using('gin', t.mentionedUserIds),
    // The list's search matches the last message anywhere in it.
    index('frontline_conversations_content_trgm_idx').using('gin', t.content.op('gin_trgm_ops')),
    check('frontline_conversations_status_check', sql`${t.status} in ('new', 'open', 'resolved')`),
    check('frontline_conversations_operator_check', sql`${t.operator} in ('bot', 'person')`),
  ],
);

export const DELIVERY_STATUSES = ['queued', 'sending', 'sent', 'failed'] as const;

/**
 * A message of a conversation: from the customer (`customerId`), a member (`userId`) or neither
 * (a bot or the system). An internal note stays in the inbox and never goes out. A member's
 * message to the customer is `queued` until a send job claims it as `sending`, so only that job
 * calls the provider, and then `sent` or `failed`. One that reaches neither within
 * `SEND_DEADLINE` of `queuedAt` reads as `failed` (`modules/inbox/post.ts`). `externalId` is the provider's
 * message id, so a retried webhook adds nothing; `providerData` is what only its adapter reads.
 */
export const messages = table(
  'messages',
  {
    id: id(),
    orgId: text().notNull(),
    conversationId: text().notNull(),
    /** Plain text: what the list shows and search matches, and what text-only providers send. */
    content: text().notNull().default(''),
    /** A member's rich text, sanitized, or null for plain text; `content` is its text. */
    html: text(),
    attachments: jsonb().$type<StoredFile[]>().notNull().default([]),
    internal: boolean().notNull().default(false),
    /** A core customer id. */
    customerId: text(),
    /** A core user id. */
    userId: text(),
    mentionedUserIds: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    replyToId: text(),
    /** The survey a member sent, which the customer votes on in this message. */
    surveyId: text(),
    externalId: text(),
    deliveryStatus: text({ enum: DELIVERY_STATUSES }),
    /**
     * When the reply's send last started: written, sent again, or claimed by a send attempt.
     */
    queuedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    providerData: jsonb().$type<Record<string, unknown>>(),
    customerReadAt: timestamp({ withTimezone: true }),
    pinnedAt: timestamp({ withTimezone: true }),
    pinnedBy: text(),
    editedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_messages_conversation_fkey',
      columns: [t.orgId, t.conversationId],
      foreignColumns: [conversations.orgId, conversations.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'frontline_messages_reply_to_fkey',
      columns: [t.replyToId],
      foreignColumns: [t.id],
    }).onDelete('set null'),
    uniqueIndex('frontline_messages_org_conversation_external_key').on(
      t.orgId,
      t.conversationId,
      t.externalId,
    ),
    index('frontline_messages_org_conversation_created_idx').on(
      t.orgId,
      t.conversationId,
      t.createdAt,
      t.id,
    ),
    index('frontline_messages_reply_to_idx').on(t.replyToId),
    // A bounce report finds the mail it is about by Message-ID alone.
    index('frontline_messages_org_external_idx')
      .on(t.orgId, t.externalId)
      .where(sql`${t.externalId} is not null`),
    // Reports count the replies of a period.
    index('frontline_messages_org_created_idx').on(t.orgId, t.createdAt),
    check('frontline_messages_author_check', sql`${t.customerId} is null or ${t.userId} is null`),
    check(
      'frontline_messages_delivery_status_check',
      sql`${t.deliveryStatus} in ('queued', 'sending', 'sent', 'failed')`,
    ),
  ],
);

/**
 * An emoji on a message, by a member or by the customer at the provider. A reactor has each
 * emoji once on a message.
 */
export const messageReactions = table(
  'message_reactions',
  {
    orgId: text().notNull(),
    messageId: text().notNull(),
    /** A core user id, for a member's reaction. */
    userId: text(),
    /** A core customer id, for the customer's reaction at the provider. */
    customerId: text(),
    emoji: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_message_reactions_message_fkey',
      columns: [t.messageId],
      foreignColumns: [messages.id],
    }).onDelete('cascade'),
    unique('frontline_message_reactions_reactor_key')
      .on(t.orgId, t.messageId, t.userId, t.customerId, t.emoji)
      .nullsNotDistinct(),
    check(
      'frontline_message_reactions_reactor_check',
      sql`(${t.userId} is null) <> (${t.customerId} is null)`,
    ),
  ],
);

/**
 * The core customer behind a provider's user id: a messenger visitor, a Facebook sender, a
 * Telegram chat. A new one is `customers.create` in core, then this row.
 */
export const customerLinks = table(
  'customer_links',
  {
    orgId: text().notNull(),
    /** The adapter kind the id comes from, such as `messenger`. */
    source: text().notNull(),
    externalId: text().notNull(),
    /** A core customer id. */
    customerId: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: 'frontline_customer_links_pkey',
      columns: [t.orgId, t.source, t.externalId],
    }),
    index('frontline_customer_links_org_customer_idx').on(t.orgId, t.customerId),
  ],
);

/** The tags on a conversation. Deleting either side deletes the row. */
export const conversationTags = table(
  'conversation_tags',
  {
    orgId: text().notNull(),
    conversationId: text().notNull(),
    tagId: text().notNull(),
  },
  (t) => [
    primaryKey({
      name: 'frontline_conversation_tags_pkey',
      columns: [t.orgId, t.conversationId, t.tagId],
    }),
    foreignKey({
      name: 'frontline_conversation_tags_conversation_fkey',
      columns: [t.orgId, t.conversationId],
      foreignColumns: [conversations.orgId, conversations.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'frontline_conversation_tags_tag_fkey',
      columns: [t.orgId, t.tagId],
      foreignColumns: [tags.orgId, tags.id],
    }).onDelete('cascade'),
    index('frontline_conversation_tags_org_tag_idx').on(t.orgId, t.tagId),
  ],
);
