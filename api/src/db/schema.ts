import type { PluginImportResult } from '@erxes/core-contract';
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
import { id, type StoredFile, stamps, table } from './table.ts';

// Pipelines, their statuses and tickets are in tickets.ts.

/** Names are unique per organisation, ignoring case. A write that breaks it fails with 23505. */
export const CHANNEL_NAME_INDEX = 'frontline_channels_org_name_key';

/**
 * A team inbox: conversations arrive in a channel, and its members work them.
 * `org_id` is the core organisation; row-level security (`core_enable_tenant_rls`
 * in the migration) shows each transaction only its organisation's rows. Ids are
 * text, so imported Mongo `_id`s fit.
 */
export const channels = table(
  'channels',
  {
    id: id(),
    orgId: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(''),
    /** A Tabler icon name from erxes-ui's IconPicker. */
    icon: text(),
    /** The core user whose personal inbox this is; null for a team channel. */
    ownerId: text(),
    ...stamps(),
  },
  (t) => [
    uniqueIndex(CHANNEL_NAME_INDEX)
      .on(t.orgId, sql`lower(${t.name})`)
      .where(sql`${t.ownerId} is null`),
    uniqueIndex('frontline_channels_owner_key').on(t.orgId, t.ownerId),
    uniqueIndex('frontline_channels_org_id_key').on(t.orgId, t.id),
  ],
);

export const CHANNEL_ROLES = ['admin', 'member'] as const;

/** Who works a channel. An admin changes the channel and its members; every channel keeps one. */
export const channelMembers = table(
  'channel_members',
  {
    orgId: text().notNull(),
    channelId: text().notNull(),
    /** A core user id. */
    userId: text().notNull(),
    role: text({ enum: CHANNEL_ROLES }).notNull().default('member'),
    createdBy: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: 'frontline_channel_members_pkey',
      columns: [t.orgId, t.channelId, t.userId],
    }),
    foreignKey({
      name: 'frontline_channel_members_channel_fkey',
      columns: [t.orgId, t.channelId],
      foreignColumns: [channels.orgId, channels.id],
    }).onDelete('cascade'),
    index('frontline_channel_members_org_user_idx').on(t.orgId, t.userId),
    check('frontline_channel_members_role_check', sql`${t.role} in ('admin', 'member')`),
  ],
);

/** A canned reply a channel's members insert into conversations. Deleting the channel deletes its templates. */
export const responseTemplates = table(
  'response_templates',
  {
    id: id(),
    orgId: text().notNull(),
    channelId: text().notNull(),
    name: text().notNull(),
    /** BlockNote blocks as JSON, from erxes-ui's Editor. */
    content: text().notNull().default(''),
    ...stamps(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_response_templates_channel_fkey',
      columns: [t.orgId, t.channelId],
      foreignColumns: [channels.orgId, channels.id],
    }).onDelete('cascade'),
    index('frontline_response_templates_org_channel_created_idx').on(
      t.orgId,
      t.channelId,
      t.createdAt,
      t.id,
    ),
  ],
);

/** Codes are unique per organisation; a write that breaks one fails with 23505. */
export const KB_TOPIC_CODE_INDEX = 'frontline_knowledgebase_topics_org_code_key';
export const KB_CATEGORY_CODE_INDEX = 'frontline_knowledgebase_categories_org_code_key';

/** A knowledge base: the categories and articles one help center publishes. */
export const kbTopics = table(
  'knowledgebase_topics',
  {
    id: id(),
    orgId: text().notNull(),
    title: text().notNull(),
    description: text(),
    /** A short code embeds and links use. */
    code: text(),
    /** A hex colour, from erxes-ui's ColorPicker. */
    color: text(),
    /** A file address from erxes-ui's Upload. */
    backgroundImage: text(),
    /** An ISO 639-1 language code. */
    languageCode: text(),
    ...stamps(),
  },
  (t) => [
    unique('frontline_knowledgebase_topics_org_id_key').on(t.orgId, t.id),
    uniqueIndex(KB_TOPIC_CODE_INDEX).on(t.orgId, t.code),
  ],
);

/**
 * A group of articles in a topic, under another category of the same topic or
 * at its top level. Deleting the topic deletes its categories; deleting a
 * category moves its subcategories to the top level.
 */
export const kbCategories = table(
  'knowledgebase_categories',
  {
    id: id(),
    orgId: text().notNull(),
    topicId: text().notNull(),
    parentId: text(),
    title: text().notNull(),
    description: text(),
    code: text(),
    /** A Tabler icon name from erxes-ui's IconPicker. */
    icon: text(),
    ...stamps(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_knowledgebase_categories_topic_fkey',
      columns: [t.orgId, t.topicId],
      foreignColumns: [kbTopics.orgId, kbTopics.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'frontline_knowledgebase_categories_parent_fkey',
      columns: [t.parentId],
      foreignColumns: [t.id],
    }).onDelete('set null'),
    unique('frontline_knowledgebase_categories_org_id_key').on(t.orgId, t.id),
    uniqueIndex(KB_CATEGORY_CODE_INDEX).on(t.orgId, t.code),
    index('frontline_knowledgebase_categories_org_topic_idx').on(t.orgId, t.topicId),
    index('frontline_knowledgebase_categories_parent_idx').on(t.parentId),
  ],
);

export const KB_ARTICLE_STATUSES = ['draft', 'publish', 'scheduled', 'archived'] as const;

/** An article of a category. Deleting the category deletes its articles. */
export const kbArticles = table(
  'knowledgebase_articles',
  {
    id: id(),
    orgId: text().notNull(),
    categoryId: text().notNull(),
    title: text().notNull(),
    summary: text(),
    /** HTML, from erxes-ui's Editor. */
    content: text().notNull().default(''),
    /** The content's words, as searches match them: no tags, and the Editor's entities decoded. */
    plainText: text()
      .notNull()
      .generatedAlwaysAs(
        sql`replace(replace(replace(replace(replace(replace(regexp_replace("content", '<[^>]*>', ' ', 'g'), '&nbsp;', ' '), '&lt;', '<'), '&gt;', '>'), '&quot;', '"'), '&#39;', ''''), '&amp;', '&')`,
      ),
    status: text({ enum: KB_ARTICLE_STATUSES }).notNull().default('draft'),
    /** When a scheduled article goes live. */
    scheduledAt: timestamp({ withTimezone: true }),
    publishedAt: timestamp({ withTimezone: true }),
    isPrivate: boolean().notNull().default(false),
    /** Image addresses readers react with. */
    reactionChoices: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    viewCount: integer().notNull().default(0),
    image: jsonb().$type<StoredFile>(),
    attachments: jsonb().$type<StoredFile[]>().notNull().default([]),
    pdfAttachment: jsonb().$type<{ pdf: StoredFile }>(),
    ...stamps(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_knowledgebase_articles_category_fkey',
      columns: [t.orgId, t.categoryId],
      foreignColumns: [kbCategories.orgId, kbCategories.id],
    }).onDelete('cascade'),
    index('frontline_knowledgebase_articles_org_category_created_idx').on(
      t.orgId,
      t.categoryId,
      t.createdAt,
      t.id,
    ),
    index('frontline_knowledgebase_articles_org_scheduled_idx')
      .on(t.orgId, t.scheduledAt)
      .where(sql`${t.status} = 'scheduled'`),
    // Searches match the title, summary or text anywhere in them; a body's file addresses are
    // found through its content.
    index('frontline_knowledgebase_articles_search_trgm_idx').using(
      'gin',
      t.title.op('gin_trgm_ops'),
      t.summary.op('gin_trgm_ops'),
      t.content.op('gin_trgm_ops'),
    ),
    index('frontline_knowledgebase_articles_text_trgm_idx').using(
      'gin',
      t.plainText.op('gin_trgm_ops'),
    ),
    check(
      'frontline_knowledgebase_articles_status_check',
      sql`${t.status} in ('draft', 'publish', 'scheduled', 'archived')`,
    ),
  ],
);

/**
 * Each import batch core sent, by its `requestId`, with what its rows did: a retried batch
 * answers this instead of writing its rows twice.
 */
export const transferRequests = table(
  'transfer_requests',
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    result: jsonb().$type<PluginImportResult>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('frontline_transfer_requests_org_created_idx').on(t.orgId, t.createdAt)],
);
