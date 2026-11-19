import type { CustomValue } from '@erxes/core-contract';
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
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
import { z } from 'zod';
import { channels } from './schema.ts';
import { type StoredFile, id, stamps, table } from './table.ts';

/** A span in working minutes, up to a year; left out, the clock isn't kept. */
const Minutes = z.number().int().positive().max(525_600).optional();

/** A ticket's priorities by name, as its column and SLA rules number them. */
export const TICKET_PRIORITIES = { none: 0, minor: 1, medium: 2, high: 3, critical: 4 } as const;

export const Priority = z.enum(TICKET_PRIORITIES);

/**
 * What a pipeline promises its tickets: a first response and a resolution time per priority,
 * at most one rule each. A rule that
 * keeps no clock is dropped. The column's type, and the schema its input and output parse with.
 */
export const SlaPolicy = z.object({
  enabled: z.boolean(),
  rules: z
    .array(
      z.object({
        priority: Priority,
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

/** Who a pipeline or a status shows to: every member of its channel, or only the ones it lists. */
const VISIBILITIES = ['public', 'private'] as const;

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
    /** The last number given with `lastNumberPrefix`, so the next ticket takes the one after it. */
    lastNumber: bigint({ mode: 'number' }),
    /** The prefix `lastNumber` was given with; a new prefix, such as a new day's, starts over. */
    lastNumberPrefix: text(),
    slaPolicy: jsonb().$type<z.output<typeof SlaPolicy>>(),
    /**
     * A private pipeline, with its statuses and tickets, shows only to its `memberIds` and the
     * channel's admins.
     */
    visibility: text({ enum: VISIBILITIES }).notNull().default('public'),
    memberIds: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /**
     * Narrow what members see of its tickets to their own (created or assigned), plus those they
     * follow or nobody holds (`isCheckUser`), their departments' (`isCheckDepartment`) and their
     * branches' (`isCheckBranch`). Channel admins and `excludeCheckUserIds` see every ticket.
     */
    isCheckUser: boolean().notNull().default(false),
    isCheckDepartment: boolean().notNull().default(false),
    isCheckBranch: boolean().notNull().default(false),
    /** Members see only tickets created today, by UTC; channel admins and `excludeCheckUserIds` see every one. */
    isCheckDate: boolean().notNull().default(false),
    excludeCheckUserIds: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    ...stamps(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_pipelines_channel_fkey',
      columns: [t.orgId, t.channelId],
      foreignColumns: [channels.orgId, channels.id],
    }).onDelete('cascade'),
    unique('frontline_pipelines_org_id_key').on(t.orgId, t.id),
    // What a ticket's foreign key names, so a ticket's channel is always its pipeline's.
    unique('frontline_pipelines_org_channel_id_key').on(t.orgId, t.channelId, t.id),
    index('frontline_pipelines_org_channel_created_idx').on(
      t.orgId,
      t.channelId,
      t.createdAt,
      t.id,
    ),
    check('frontline_pipelines_visibility_check', sql`${t.visibility} in ('public', 'private')`),
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
    /** A private status's tickets show only to its `memberIds` and the channel's admins. */
    visibilityType: text({ enum: VISIBILITIES }).notNull().default('public'),
    memberIds: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** When set, only these members, and the channel's admins, edit or move its tickets. */
    canEditMemberIds: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    canMoveMemberIds: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
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
    // What a ticket's foreign key names, so a ticket's status is always of its pipeline.
    unique('frontline_pipeline_statuses_org_pipeline_id_key').on(t.orgId, t.pipelineId, t.id),
    index('frontline_pipeline_statuses_org_pipeline_type_order_idx').on(
      t.orgId,
      t.pipelineId,
      t.type,
      t.order,
    ),
    check('frontline_pipeline_statuses_type_check', sql`${t.type} between 1 and 6`),
    check(
      'frontline_pipeline_statuses_visibility_check',
      sql`${t.visibilityType} in ('public', 'private')`,
    ),
  ],
);

export const TICKET_STATES = ['active', 'archived'] as const;

/** A ticket's `priority` in words, by its number. */
export const PRIORITY_NAMES = ['No priority', 'Minor', 'Medium', 'High', 'Critical'];

/** Numbers are unique per pipeline; a write that breaks one fails with 23505. */
export const TICKET_NUMBER_INDEX = 'frontline_tickets_org_pipeline_number_key';

/**
 * A piece of work in a pipeline of a channel, in one of the pipeline's statuses. Deleting the
 * channel deletes its tickets; a pipeline or status keeps its tickets, so it can't be deleted
 * while it has any. Moving a pipeline to another channel takes its tickets along.
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
    priority: integer().$type<z.infer<typeof Priority>>().notNull().default(TICKET_PRIORITIES.none),
    /** A core user id. */
    assigneeId: text(),
    /** Core user ids: who else works it, and who follows its changes. */
    assignedMemberIds: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    subscribedUserIds: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** `frontline_tags` of type `ticket`; deleting a tag takes it off every ticket. */
    tagIds: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    /** Values of the ticket's custom fields, by core field id (`frontline.ticket`). */
    propertiesData: jsonb().$type<Record<string, CustomValue>>().notNull().default({}),
    /** `frontline_teams` of each kind, core's units; a unit deleted in core clears them. */
    branchId: text(),
    departmentId: text(),
    /** The core customer and company the ticket is about. */
    customerId: text(),
    companyId: text(),
    startDate: timestamp({ withTimezone: true }),
    targetDate: timestamp({ withTimezone: true }),
    state: text({ enum: TICKET_STATES }).notNull().default('active'),
    attachments: jsonb().$type<StoredFile[]>().notNull().default([]),
    statusChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    statusChangedBy: text(),
    /** When the pipeline's SLA wants a first response and a resolution, counted from creation. */
    firstResponseDueAt: timestamp({ withTimezone: true }),
    resolutionDueAt: timestamp({ withTimezone: true }),
    /** When the ticket first left a new status, and when it reached a resolved or closed one. */
    firstRespondedAt: timestamp({ withTimezone: true }),
    resolvedAt: timestamp({ withTimezone: true }),
    /** When the SLA job told the assignee a clock is about to run out, and that it ran out. */
    firstResponseWarnedAt: timestamp({ withTimezone: true }),
    firstResponseBreachedAt: timestamp({ withTimezone: true }),
    resolutionWarnedAt: timestamp({ withTimezone: true }),
    resolutionBreachedAt: timestamp({ withTimezone: true }),
    ...stamps(),
    /** The member who made it, or null when the customer filed it from the messenger. */
    createdBy: text(),
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
    // The list's default order, across the caller's channels.
    index('frontline_tickets_org_updated_idx').on(t.orgId, t.updatedAt, t.id),
    // The list of one pipeline, in either of its orders.
    index('frontline_tickets_org_pipeline_updated_idx').on(
      t.orgId,
      t.pipelineId,
      t.updatedAt,
      t.id,
    ),
    index('frontline_tickets_org_pipeline_created_idx').on(
      t.orgId,
      t.pipelineId,
      t.createdAt,
      t.id,
    ),
    // The SLA check's running clocks (`modules/tickets/sla.ts`), a few among every ticket.
    index('frontline_tickets_org_first_response_due_idx')
      .on(t.orgId, t.firstResponseDueAt)
      .where(
        sql`${t.state} = 'active' and ${t.firstRespondedAt} is null and ${t.firstResponseBreachedAt} is null`,
      ),
    index('frontline_tickets_org_resolution_due_idx')
      .on(t.orgId, t.resolutionDueAt)
      .where(
        sql`${t.state} = 'active' and ${t.resolvedAt} is null and ${t.resolutionBreachedAt} is null`,
      ),
    // The list's search matches the name or number anywhere in it.
    index('frontline_tickets_search_trgm_idx').using(
      'gin',
      t.name.op('gin_trgm_ops'),
      t.number.op('gin_trgm_ops'),
    ),
    index('frontline_tickets_org_channel_idx').on(t.orgId, t.channelId),
    index('frontline_tickets_org_assignee_idx').on(t.orgId, t.assigneeId),
    index('frontline_tickets_org_customer_idx').on(t.orgId, t.customerId),
    index('frontline_tickets_org_company_idx').on(t.orgId, t.companyId),
    index('frontline_tickets_tag_ids_idx').using('gin', t.tagIds),
    check('frontline_tickets_priority_check', sql`${t.priority} between 0 and 4`),
    check('frontline_tickets_state_check', sql`${t.state} in ('active', 'archived')`),
  ],
);

export const PROPERTY_TYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'multiselect',
  'boolean',
] as const;

/**
 * Retired: ticket fields are core's custom fields on `frontline.ticket` now. Only
 * `scripts/move-ticket-properties.ts` reads these rows, to make them in core; the table stays
 * until every organisation's are moved.
 */
export const ticketProperties = table(
  'ticket_properties',
  {
    id: id(),
    orgId: text().notNull(),
    label: text().notNull(),
    description: text(),
    type: text({ enum: PROPERTY_TYPES }).notNull(),
    /** The choices of a `select` or `multiselect`. */
    options: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    isRequired: boolean().notNull().default(false),
    pipelineIds: text()
      .array()
      .notNull()
      .default(sql`'{}'`),
    order: integer().notNull().default(0),
    ...stamps(),
  },
  (t) => [
    index('frontline_ticket_properties_org_order_idx').on(t.orgId, t.order),
    check(
      'frontline_ticket_properties_type_check',
      sql`${t.type} in ('text', 'textarea', 'number', 'date', 'select', 'multiselect', 'boolean')`,
    ),
  ],
);
