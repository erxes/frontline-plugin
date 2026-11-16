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
import { type Attachment, id, stamps, table } from './table.ts';

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
    /** A core user id. */
    assigneeId: text(),
    /** The members who wrote in it. */
    participantIds: text()
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
    // The list's order, across the caller's channels.
    index('frontline_conversations_org_last_message_idx').on(
      t.orgId,
      t.lastMessageAt.desc(),
      t.id.desc(),
    ),
    index('frontline_conversations_org_channel_status_idx').on(t.orgId, t.channelId, t.status),
    index('frontline_conversations_org_customer_idx').on(t.orgId, t.customerId),
    index('frontline_conversations_org_assignee_idx').on(t.orgId, t.assigneeId),
    check('frontline_conversations_status_check', sql`${t.status} in ('new', 'open', 'resolved')`),
  ],
);

export const DELIVERY_STATUSES = ['queued', 'sent', 'failed'] as const;

/**
 * A message of a conversation: from the customer (`customerId`), a member (`userId`) or neither
 * (a bot or the system). An internal note stays in the inbox and never goes out. A member's
 * message to the customer is `queued` until its adapter sends it. `externalId` is the provider's
 * message id, so a retried webhook adds nothing; `providerData` is what only its adapter reads.
 */
export const messages = table(
  'messages',
  {
    id: id(),
    orgId: text().notNull(),
    conversationId: text().notNull(),
    /** Plain text. */
    content: text().notNull().default(''),
    attachments: jsonb().$type<Attachment[]>().notNull().default([]),
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
    externalId: text(),
    deliveryStatus: text({ enum: DELIVERY_STATUSES }),
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
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index('frontline_messages_reply_to_idx').on(t.replyToId),
    check('frontline_messages_author_check', sql`${t.customerId} is null or ${t.userId} is null`),
    check(
      'frontline_messages_delivery_status_check',
      sql`${t.deliveryStatus} in ('queued', 'sent', 'failed')`,
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
