import { bigint, integer, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
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

/**
 * What each limiter in `modules/limits.ts` has counted in its current minute, by key: a visitor's
 * IP, a messenger key or a form key, behind the limiter's prefix. rate-limiter-flexible reads and
 * writes it in this shape, so every replica counts against the same row. It has no `org_id`
 * column: a request is counted before its organisation is known (`tools/no-org-id.sql`).
 */
export const rateLimits = table('rate_limits', {
  key: text().primaryKey(),
  points: integer().notNull().default(0),
  /** When the count starts over, in milliseconds since the epoch. */
  expire: bigint({ mode: 'number' }),
});
