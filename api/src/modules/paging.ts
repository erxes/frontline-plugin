import { desc, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';

/** A table a list pages through newest first, keyed on `(created_at, id)`. */
type Dated = PgTable & { createdAt: AnyPgColumn; id: AnyPgColumn };

/** A list's input: pass the last `id` as `cursor` for the page after it. */
export const PageInput = {
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(50),
};

/** Newest first, ties broken by id. */
export const newestFirst = (table: Dated) => [desc(table.createdAt), desc(table.id)];

/** The rows after `cursor` in `newestFirst` order, or no condition on the first page. */
export const after = (table: Dated, cursor: string | undefined) =>
  cursor
    ? sql`(${table.createdAt}, ${table.id}) < (
        select created_at, id from ${table} where id = ${cursor}
      )`
    : undefined;

/** A page of `limit` from the `limit + 1` rows read, and the cursor for the next one. */
export const pageOf = <T extends { id: string }>(rows: T[], limit: number) => {
  const items = rows.slice(0, limit);

  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
};
