import { randomUUID } from 'node:crypto';
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
import { z } from 'zod';
import { table } from './table.ts';

/** A text id: a random UUID, or the Mongo `_id` an imported row keeps. */
const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => randomUUID());

/** Who made the row and when, and when it last changed. */
const stamps = () => ({
  createdBy: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

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
    ...stamps(),
  },
  (t) => [
    uniqueIndex(CHANNEL_NAME_INDEX).on(t.orgId, sql`lower(${t.name})`),
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
      t.createdAt.desc(),
      t.id.desc(),
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

/** A span in working minutes, up to a year; left out, the clock isn't kept. */
const Minutes = z.number().int().positive().max(525_600).optional();

/**
 * What a pipeline promises its tickets: a first response and a resolution time per priority
 * (0 no priority, 1 minor, 2 medium, 3 high, 4 critical), at most one rule each. A rule that
 * keeps no clock is dropped. The column's type, and the schema its input and output parse with.
 */
export const SlaPolicy = z.object({
  enabled: z.boolean(),
  rules: z
    .array(
      z.object({
        priority: z.number().int().min(0).max(4),
        firstResponseMinutes: Minutes,
        resolutionMinutes: Minutes,
      }),
    )
    .refine(
      (rules) => new Set(rules.map((rule) => rule.priority)).size === rules.length,
      'Each priority can have one SLA rule',
    )
    .transform((rules) =>
      rules.filter(
        (rule) => rule.firstResponseMinutes !== undefined || rule.resolutionMinutes !== undefined,
      ),
    ),
  warnBeforeMinutes: Minutes,
});

/**
 * A channel's ticket workflow: its statuses, how its tickets are numbered and
 * named, and its SLA. Deleting the channel deletes its pipelines.
 */
export const pipelines = table(
  'pipelines',
  {
    id: id(),
    orgId: text().notNull(),
    channelId: text().notNull(),
    name: text().notNull(),
    description: text(),
    /** The ticket number's prefix, with `{year}`, `{month}` and `{day}` filled in. */
    numberConfig: text(),
    /** How many digits the ticket number's sequence has; tickets aren't numbered without it. */
    numberSize: integer(),
    /** A ticket's name, from `{customer.firstName}` and the like. */
    nameConfig: text(),
    slaPolicy: jsonb().$type<z.output<typeof SlaPolicy>>(),
    ...stamps(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_pipelines_channel_fkey',
      columns: [t.orgId, t.channelId],
      foreignColumns: [channels.orgId, channels.id],
    }).onDelete('cascade'),
    unique('frontline_pipelines_org_id_key').on(t.orgId, t.id),
    index('frontline_pipelines_org_channel_created_idx').on(
      t.orgId,
      t.channelId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
  ],
);

/** The stages a ticket moves through, in the order a pipeline shows them. */
export const STATUS_TYPES = {
  new: 1,
  open: 2,
  inProgress: 3,
  resolved: 4,
  closed: 5,
  cancelled: 6,
} as const;

/**
 * A status of a pipeline: one step of a stage (`type`), placed by `order`
 * among that stage's statuses. Deleting the pipeline deletes its statuses.
 */
export const pipelineStatuses = table(
  'pipeline_statuses',
  {
    id: id(),
    orgId: text().notNull(),
    pipelineId: text().notNull(),
    name: text().notNull(),
    description: text(),
    /** A hex colour, from erxes-ui's ColorPicker. */
    color: text().notNull().default('#4F46E5'),
    type: integer().notNull(),
    order: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      name: 'frontline_pipeline_statuses_pipeline_fkey',
      columns: [t.orgId, t.pipelineId],
      foreignColumns: [pipelines.orgId, pipelines.id],
    }).onDelete('cascade'),
    index('frontline_pipeline_statuses_org_pipeline_type_order_idx').on(
      t.orgId,
      t.pipelineId,
      t.type,
      t.order,
    ),
    check('frontline_pipeline_statuses_type_check', sql`${t.type} between 1 and 6`),
  ],
);

export const KB_ARTICLE_STATUSES = ['draft', 'publish', 'scheduled', 'archived'] as const;

/** A file on core's storage, as erxes-ui's Upload reports it. */
export type KbAttachment = { url: string; name: string; type?: string; size?: number };

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
    image: jsonb().$type<KbAttachment>(),
    attachments: jsonb().$type<KbAttachment[]>().notNull().default([]),
    pdfAttachment: jsonb().$type<{ pdf: KbAttachment }>(),
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
      t.createdAt.desc(),
      t.id.desc(),
    ),
    index('frontline_knowledgebase_articles_org_scheduled_idx')
      .on(t.orgId, t.scheduledAt)
      .where(sql`${t.status} = 'scheduled'`),
    check(
      'frontline_knowledgebase_articles_status_check',
      sql`${t.status} in ('draft', 'publish', 'scheduled', 'archived')`,
    ),
  ],
);
