import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { channels } from './schema.ts';
import { type Attachment, id, stamps, table } from './table.ts';

/** One ticket priority's promise, in working minutes; a clock left out is not kept. */
export type SlaRule = {
  /** 0 no priority, 1 minor, 2 medium, 3 high, 4 critical. */
  priority: number;
  firstResponseMinutes?: number;
  resolutionMinutes?: number;
};

/** What a pipeline promises its tickets: a response and a resolution time per priority. */
export type SlaPolicy = { enabled: boolean; rules: SlaRule[]; warnBeforeMinutes?: number };

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
    slaPolicy: jsonb().$type<SlaPolicy>(),
    ...stamps(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_pipelines_channel_fkey',
      columns: [t.orgId, t.channelId],
      foreignColumns: [channels.orgId, channels.id],
    }).onDelete('cascade'),
    unique('frontline_pipelines_org_id_key').on(t.orgId, t.id),
    unique('frontline_pipelines_org_channel_id_key').on(t.orgId, t.channelId, t.id),
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
    unique('frontline_pipeline_statuses_org_pipeline_id_key').on(t.orgId, t.pipelineId, t.id),
    check('frontline_pipeline_statuses_type_check', sql`${t.type} between 1 and 6`),
  ],
);

/** An archived ticket leaves the default list but keeps its place. */
export const TICKET_STATES = ['active', 'archived'] as const;

/** Numbers are unique per pipeline; a write that breaks it fails with 23505. */
export const TICKET_NUMBER_INDEX = 'frontline_tickets_org_pipeline_number_key';

/**
 * A customer request a channel's members work through a pipeline's statuses.
 * The status belongs to the pipeline and the pipeline to the channel: moving a
 * pipeline to another channel takes its tickets along, and a pipeline or status
 * with tickets can't be deleted. Deleting the channel deletes its tickets.
 */
export const tickets = table(
  'tickets',
  {
    id: id(),
    orgId: text().notNull(),
    channelId: text().notNull(),
    pipelineId: text().notNull(),
    statusId: text().notNull(),
    /** From the pipeline's `numberConfig` and `numberSize`; null when it doesn't number tickets. */
    number: text(),
    name: text().notNull(),
    /** BlockNote blocks as JSON, from erxes-ui's Editor. */
    description: text().notNull().default(''),
    /** 0 no priority, 1 minor, 2 medium, 3 high, 4 critical, as SLA rules name them. */
    priority: integer().notNull().default(0),
    /** A core user id. */
    assigneeId: text(),
    startDate: timestamp({ withTimezone: true }),
    targetDate: timestamp({ withTimezone: true }),
    state: text({ enum: TICKET_STATES }).notNull().default('active'),
    attachments: jsonb().$type<Attachment[]>().notNull().default([]),
    statusChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    statusChangedBy: text(),
    /** When the pipeline's SLA wants a first response and a resolution, counted from creation. */
    firstResponseDueAt: timestamp({ withTimezone: true }),
    resolutionDueAt: timestamp({ withTimezone: true }),
    /** When the ticket first left a new status, and when it reached a resolved or closed one. */
    firstRespondedAt: timestamp({ withTimezone: true }),
    resolvedAt: timestamp({ withTimezone: true }),
    ...stamps(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_tickets_channel_fkey',
      columns: [t.orgId, t.channelId],
      foreignColumns: [channels.orgId, channels.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'frontline_tickets_pipeline_fkey',
      columns: [t.orgId, t.channelId, t.pipelineId],
      foreignColumns: [pipelines.orgId, pipelines.channelId, pipelines.id],
    }).onUpdate('cascade'),
    foreignKey({
      name: 'frontline_tickets_status_fkey',
      columns: [t.orgId, t.pipelineId, t.statusId],
      foreignColumns: [pipelineStatuses.orgId, pipelineStatuses.pipelineId, pipelineStatuses.id],
    }),
    uniqueIndex(TICKET_NUMBER_INDEX).on(t.orgId, t.pipelineId, t.number),
    index('frontline_tickets_org_pipeline_status_idx').on(t.orgId, t.pipelineId, t.statusId),
    index('frontline_tickets_org_channel_updated_idx').on(
      t.orgId,
      t.channelId,
      t.updatedAt.desc(),
      t.id.desc(),
    ),
    index('frontline_tickets_org_assignee_idx').on(t.orgId, t.assigneeId),
    check('frontline_tickets_priority_check', sql`${t.priority} between 0 and 4`),
    check('frontline_tickets_state_check', sql`${t.state} in ('active', 'archived')`),
  ],
);
