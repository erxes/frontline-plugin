import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  real,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { conversations } from './inbox.ts';
import { integrationAccounts } from './integrations.ts';
import { type StoredFile, id, table } from './table.ts';

/**
 * Phone calls through a connected PBX (provider `call`) or CallPro line (`callpro`). The
 * account is a `frontline_integration_accounts` row; these tables hold what only calls have.
 * Code lives in `api/src/modules/integrations/providers/call`.
 */

export const OPERATOR_STATUSES = ['unavailable', 'available', 'paused'] as const;

/** A member who answers a PBX's calls, by their extension on it. */
export const callOperators = table(
  'call_operators',
  {
    id: id(),
    orgId: text().notNull(),
    accountId: text().notNull(),
    /** A core user id. */
    userId: text().notNull(),
    extension: text().notNull(),
    /**
     * The extension's SIP password, sealed (`sealSecret`), which the member's softphone signs in
     * to the PBX with. Without it the member has no softphone on this PBX.
     */
    sipSecret: text(),
    /** What the member last told the PBX: available for its queues, or paused. */
    status: text({ enum: OPERATOR_STATUSES }).notNull().default('unavailable'),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      name: 'frontline_call_operators_account_fkey',
      columns: [t.orgId, t.accountId],
      foreignColumns: [integrationAccounts.orgId, integrationAccounts.id],
    }).onDelete('cascade'),
    unique('frontline_call_operators_org_account_user_key').on(t.orgId, t.accountId, t.userId),
    unique('frontline_call_operators_org_account_extension_key').on(
      t.orgId,
      t.accountId,
      t.extension,
    ),
    index('frontline_call_operators_org_user_idx').on(t.orgId, t.userId),
    check(
      'frontline_call_operators_status_check',
      sql`${t.status} in ('unavailable', 'available', 'paused')`,
    ),
  ],
);

/** What a queue's live board shows, as the PBX last sent it. */
export type QueueLive = {
  agents: {
    extension: string;
    name: string;
    status: string;
    answered: number;
    abandoned: number;
    talkSeconds: number;
    pausedAt: string | null;
  }[];
  waiting: { callerId: string; channel: string | null }[];
  talking: { callerId: string; calleeId: string | null; since: string | null }[];
};

/**
 * A PBX queue frontline shows: its counters for the day and its live board, both as the PBX last
 * reported them.
 */
export const callQueues = table(
  'call_queues',
  {
    id: id(),
    orgId: text().notNull(),
    accountId: text().notNull(),
    /** The queue's number on the PBX. */
    queue: text().notNull(),
    name: text().notNull().default(''),
    totalCalls: integer().notNull().default(0),
    answeredCalls: integer().notNull().default(0),
    abandonedCalls: integer().notNull().default(0),
    transferredCalls: integer().notNull().default(0),
    /** Seconds. */
    avgWait: real().notNull().default(0),
    avgTalk: real().notNull().default(0),
    /** Percent of calls answered within the queue's service level. */
    slaRate: real().notNull().default(0),
    statsAt: timestamp({ withTimezone: true }),
    live: jsonb().$type<QueueLive>(),
    liveAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    foreignKey({
      name: 'frontline_call_queues_account_fkey',
      columns: [t.orgId, t.accountId],
      foreignColumns: [integrationAccounts.orgId, integrationAccounts.id],
    }).onDelete('cascade'),
    unique('frontline_call_queues_org_account_queue_key').on(t.orgId, t.accountId, t.queue),
  ],
);

export const CALL_DIRECTIONS = ['incoming', 'outgoing'] as const;

/** Ringing and active while it lasts, then how it ended. */
export const CALL_STATUSES = [
  'ringing',
  'active',
  'answered',
  'missed',
  'busy',
  'failed',
  'voicemail',
] as const;

/**
 * One phone call, whatever legs the PBX split it into. It lives in its own inbox conversation
 * with its customer, found or made in core by phone number.
 */
export const calls = table(
  'calls',
  {
    id: id(),
    orgId: text().notNull(),
    accountId: text().notNull(),
    conversationId: text().notNull(),
    /** A core customer id. */
    customerId: text().notNull(),
    /** The provider's id for the call: the PBX's linked id, CallPro's call id. */
    callKey: text().notNull(),
    direction: text({ enum: CALL_DIRECTIONS }).notNull(),
    status: text({ enum: CALL_STATUSES }).notNull().default('ringing'),
    customerPhone: text().notNull(),
    /** The organisation's number the call came in on or went out from. */
    number: text().notNull().default(''),
    queue: text(),
    /** The extension that answered. */
    extension: text(),
    /** A core user id: the operator behind `extension`. */
    answeredBy: text(),
    startedAt: timestamp({ withTimezone: true }).notNull(),
    answeredAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    durationSec: integer(),
    /** The recording on core's storage, once fetched from the PBX. */
    recording: jsonb().$type<StoredFile>(),
    /** The PBX's name for the recording, until it is fetched. */
    recordingFile: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    foreignKey({
      name: 'frontline_calls_account_fkey',
      columns: [t.orgId, t.accountId],
      foreignColumns: [integrationAccounts.orgId, integrationAccounts.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'frontline_calls_conversation_fkey',
      columns: [t.orgId, t.conversationId],
      foreignColumns: [conversations.orgId, conversations.id],
    }).onDelete('cascade'),
    unique('frontline_calls_org_id_key').on(t.orgId, t.id),
    unique('frontline_calls_org_account_key_key').on(t.orgId, t.accountId, t.callKey),
    index('frontline_calls_org_started_idx').on(t.orgId, t.startedAt, t.id),
    index('frontline_calls_org_customer_idx').on(t.orgId, t.customerId),
    index('frontline_calls_org_conversation_idx').on(t.orgId, t.conversationId),
    // The list's search matches the phone number anywhere in it.
    index('frontline_calls_customer_phone_trgm_idx').using(
      'gin',
      t.customerPhone.op('gin_trgm_ops'),
    ),
    check('frontline_calls_direction_check', sql`${t.direction} in ('incoming', 'outgoing')`),
    check(
      'frontline_calls_status_check',
      sql`${t.status} in ('ringing', 'active', 'answered', 'missed', 'busy', 'failed', 'voicemail')`,
    ),
  ],
);

/** One CDR the PBX sent for a call, kept as sent: a call's status reads all its legs. */
export const callLegs = table(
  'call_legs',
  {
    id: id(),
    orgId: text().notNull(),
    callId: text().notNull(),
    /** The PBX's `AcctId`, so a CDR sent twice adds nothing. */
    legId: text().notNull(),
    cdr: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_call_legs_call_fkey',
      columns: [t.orgId, t.callId],
      foreignColumns: [calls.orgId, calls.id],
    }).onDelete('cascade'),
    unique('frontline_call_legs_org_call_leg_key').on(t.orgId, t.callId, t.legId),
  ],
);
