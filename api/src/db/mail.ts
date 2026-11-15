import { sql } from 'drizzle-orm';
import { check, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { id, table } from './table.ts';

/** A bounce is a delivery report that gave up; a complaint is a recipient's spam report. */
export const SUPPRESSION_REASONS = ['bounce', 'complaint'] as const;

/**
 * Addresses frontline no longer mails, as a connected mailbox heard of them. A mail to one fails
 * before it reaches the server; removing the row lets it through again.
 */
export const emailSuppressions = table(
  'email_suppressions',
  {
    id: id(),
    orgId: text().notNull(),
    /** Lowercased. */
    address: text().notNull(),
    reason: text({ enum: SUPPRESSION_REASONS }).notNull(),
    /** What the report said, such as the server's diagnostic. */
    detail: text(),
    /** The mailbox the report reached. */
    accountId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique('frontline_email_suppressions_org_address_key').on(t.orgId, t.address),
    check('frontline_email_suppressions_reason_check', sql`${t.reason} in ('bounce', 'complaint')`),
  ],
);
