import { asc, desc, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';

/** A table a list pages through, keyed on a date column and `id`. */
type Dated = PgTable & { createdAt: AnyPgColumn; id: AnyPgColumn };

/** A list's input: pass the last `id` as `cursor` for the page after it. */
export const PageInput = {
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(50),
};

/**
 * A list's order by `column`, ties broken by id, newest first unless `ascending`, and the rows
 * after `cursor` in it (no condition on the first page).
 */
export const orderOf = (table: Dated, column: AnyPgColumn = table.createdAt, ascending = false) => {
  const direction = ascending ? asc : desc;

  return {
    orderBy: [direction(column), direction(table.id)],
    after: (cursor: string | undefined) =>
      cursor
        ? sql`(${column}, ${table.id}) ${sql.raw(ascending ? '>' : '<')} (
            select ${column}, ${table.id} from ${table} where ${table.id} = ${cursor}
          )`
        : undefined,
  };
};

/** Newest first, ties broken by id. */
export const newestFirst = (table: Dated) => orderOf(table).orderBy;

/** The rows after `cursor` in `newestFirst` order, or no condition on the first page. */
export const after = (table: Dated, cursor: string | undefined) => orderOf(table).after(cursor);

/** A page of `limit` from the `limit + 1` rows read, and the cursor for the next one. */
export const pageOf = <T extends { id: string }>(rows: T[], limit: number) => {
  const items = rows.slice(0, limit);

  return { items, nextCursor: rows.length > limit ? (items.at(-1)?.id ?? null) : null };
};
