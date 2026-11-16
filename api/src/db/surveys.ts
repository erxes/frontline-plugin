import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
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
import { channels } from './schema.ts';
import { Attachment, id, stamps, table } from './table.ts';

/** `pending` waits for a member's approval; `rejected` carries the reason. */
export const SURVEY_STATUSES = ['pending', 'active', 'rejected', 'archived'] as const;

/** An id inside a survey's steps: kept when given, so votes still name it, else a new one. */
const ItemId = z.string().min(1).max(100).default(randomUUID);

/** When an option's votes reach `threshold`, a ticket opens in this pipeline and status. */
export const OptionTicket = z.object({
  threshold: z.number().int().min(1).max(100_000),
  pipelineId: z.string(),
  statusId: z.string(),
});

export const SurveyOption = z.object({
  id: ItemId,
  text: z.string().trim().min(1).max(100),
  ticket: OptionTicket.nullable().default(null),
});

/** One question of a survey and its options, at least two, unique ignoring case. */
export const SurveyStep = z.object({
  id: ItemId,
  name: z.string().trim().max(100).default(''),
  description: z.string().trim().max(1000).default(''),
  question: z.string().trim().min(1).max(300),
  attachments: z.array(Attachment).max(5).default([]),
  allowMultiselect: z.boolean().default(false),
  options: z
    .array(SurveyOption)
    .min(2, 'A question needs at least 2 options')
    .max(10)
    .refine(
      (options) =>
        new Set(options.map((option) => option.text.toLowerCase())).size === options.length,
      'Options must be unique',
    ),
});

/** Codes are unique per organisation; a write that breaks one fails with 23505. */
export const SURVEY_CODE_INDEX = 'frontline_surveys_org_code_key';

/**
 * A poll a channel's members send into conversations: one or more questions, each with options
 * visitors vote on. Deleting the channel deletes its surveys.
 */
export const surveys = table(
  'surveys',
  {
    id: id(),
    orgId: text().notNull(),
    channelId: text().notNull(),
    title: text().notNull(),
    code: text().notNull(),
    status: text({ enum: SURVEY_STATUSES }).notNull().default('active'),
    rejectionReason: text(),
    /** How long voting stays open after it is sent. */
    durationHours: integer(),
    steps: jsonb().$type<z.output<typeof SurveyStep>[]>().notNull().default([]),
    /** How many conversations it was sent to. */
    sentCount: integer().notNull().default(0),
    ...stamps(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_surveys_channel_fkey',
      columns: [t.orgId, t.channelId],
      foreignColumns: [channels.orgId, channels.id],
    }).onDelete('cascade'),
    unique('frontline_surveys_org_id_key').on(t.orgId, t.id),
    uniqueIndex(SURVEY_CODE_INDEX).on(t.orgId, t.code),
    index('frontline_surveys_org_created_idx').on(t.orgId, t.createdAt.desc(), t.id.desc()),
    check(
      'frontline_surveys_status_check',
      sql`${t.status} in ('pending', 'active', 'rejected', 'archived')`,
    ),
    check('frontline_surveys_duration_check', sql`${t.durationHours} between 1 and 768`),
  ],
);

/**
 * A voter's picks on a survey sent in a conversation message: one vote per voter and message,
 * which a second pick replaces. Deleting the survey deletes its votes.
 */
export const surveyVotes = table(
  'survey_votes',
  {
    id: id(),
    orgId: text().notNull(),
    surveyId: text().notNull(),
    conversationId: text().notNull(),
    messageId: text().notNull(),
    /** The customer or visitor who voted. */
    voterId: text().notNull(),
    customerId: text(),
    visitorId: text(),
    optionIds: text()
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
      name: 'frontline_survey_votes_survey_fkey',
      columns: [t.orgId, t.surveyId],
      foreignColumns: [surveys.orgId, surveys.id],
    }).onDelete('cascade'),
    uniqueIndex('frontline_survey_votes_org_message_voter_key').on(t.orgId, t.messageId, t.voterId),
    index('frontline_survey_votes_org_survey_idx').on(t.orgId, t.surveyId),
  ],
);

/**
 * The ticket an option's votes opened when they reached its threshold: once per option, so a
 * changed vote that crosses it again opens none. Deleting the survey deletes the rows.
 */
export const surveyTickets = table(
  'survey_tickets',
  {
    orgId: text().notNull(),
    surveyId: text().notNull(),
    optionId: text().notNull(),
    ticketId: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: 'frontline_survey_tickets_pkey',
      columns: [t.orgId, t.surveyId, t.optionId],
    }),
    foreignKey({
      name: 'frontline_survey_tickets_survey_fkey',
      columns: [t.orgId, t.surveyId],
      foreignColumns: [surveys.orgId, surveys.id],
    }).onDelete('cascade'),
  ],
);
