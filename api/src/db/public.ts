import { text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { table } from './table.ts';

/**
 * The key or domain a signed-out request carries (a form embed, a help center), and the
 * organisation and record it opens. It has no `org_id` column: the public route reads it before
 * it knows the organisation, then runs its transaction in `orgOf` (`tools/no-org-id.sql`).
 */
export const publicKeys = table(
  'public_keys',
  {
    /** A random key, or a domain the organisation connected. */
    key: text().primaryKey(),
    /** The core organisation the key opens. */
    orgOf: text().notNull(),
    /** What the key opens, such as `help-center`, and that record's id. */
    kind: text().notNull(),
    targetId: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('frontline_public_keys_kind_target_key').on(t.kind, t.targetId)],
);
