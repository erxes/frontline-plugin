import { ORPCError } from '@orpc/server';
import { asc, desc, eq, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import type { Tx } from '#/db/client.ts';

/** A table a list pages through, keyed on a date column and `id`. */
type Dated = PgTable & { createdAt: AnyPgColumn; id: AnyPgColumn };

/** A list's input: pass the `nextCursor` a page gave as `cursor` for the page after it. */
export const PageInput = {
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(50),
};

/** What a cursor holds: the last row's date as Postgres prints it, to the microsecond, and its id. */
const Cursor = z.tuple([z.string(), z.string()]);

const decode = (cursor: string) => {
  try {
    return Cursor.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
  } catch {
    throw new ORPCError('BAD_REQUEST', { message: 'Pass a nextCursor a list returned' });
  }
};

/**
 * A list's order by `column`, ties broken by id, newest first unless `ascending`: the rows after
 * a cursor, and a page with the cursor for the next one. The cursor carries the last row's sort
 * values, so the next page holds even when that row is deleted meanwhile.
 */
export const orderOf = (table: Dated, column: AnyPgColumn = table.createdAt, ascending = false) => {
  const direction = ascending ? asc : desc;

  return {
    orderBy: [direction(column), direction(table.id)],

    /** The rows after `cursor`, or no condition on the first page. */
    after: (cursor: string | undefined) => {
      if (!cursor) return undefined;

      const [value, id] = decode(cursor);

      return sql`(${column}, ${table.id}) ${sql.raw(ascending ? '>' : '<')} (${value}::timestamptz, ${id})`;
    },

    /** A page of `limit` from the `limit + 1` rows read, and the cursor for the next one. */
    page: async <T extends { id: string }>(tx: Tx, rows: T[], limit: number) => {
      const items = rows.slice(0, limit);
      const last = items.at(-1);

      if (rows.length <= limit || !last) return { items, nextCursor: null };

      // A JS Date keeps milliseconds, so the exact value comes from Postgres.
      const [row] = await tx
        .select({ value: sql<string>`${column}::text` })
        .from(table)
        .where(eq(table.id, last.id));

      if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR');

      return {
        items,
        nextCursor: Buffer.from(JSON.stringify([row.value, last.id])).toString('base64url'),
      };
    },
  };
};
