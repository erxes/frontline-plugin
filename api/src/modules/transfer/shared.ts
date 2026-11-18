import type {
  PluginExportPage,
  PluginImportRequest,
  PluginImportResult,
} from '@erxes/core-contract';
import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { eq, lt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { transferRequests } from '#/db/schema.ts';
import { inOrder } from '../integrations/provider.ts';

export type ImportRequest = z.infer<typeof PluginImportRequest>;

export type RowResult = PluginImportResult['rows'][number];

/**
 * The member core asks for. Core checked the transfer permission; it doesn't send the rest, so
 * they see and change what their channels hold, as a member without channel management does.
 */
export const transferMember = (orgId: string, userId: string) =>
  ({
    userId,
    orgId,
    role: 'member',
    permissions: [PERMISSIONS.channelView],
    can: (action) => action === PERMISSIONS.channelView,
    tier: null,
    access: 'full',
    canChange: () => true,
  }) satisfies PluginMember;

/** Rolls a check back once every row ran. */
class DryRun extends Error {
  readonly rows: RowResult[];

  constructor(rows: RowResult[]) {
    super('dry run');
    this.rows = rows;
  }
}

/** Why a row failed, in words the member's error report shows. */
const reasonOf = (error: unknown) =>
  error instanceof ORPCError || error instanceof Error ? error.message : 'Something went wrong';

/**
 * Runs `row` for each row of the batch, each in its own savepoint so a failed row leaves the
 * others, in one transaction: a check rolls it all back, and an import stores what each row did
 * under the request's id, which a retried batch answers instead of writing again.
 */
export const runImport = async (
  request: ImportRequest,
  row: (tx: Tx, values: Record<string, string>) => Promise<Omit<RowResult, 'rowNumber'>>,
) => {
  try {
    return await withOrg(request.orgId, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${request.requestId}))`);

      const [done] = await tx
        .select({ result: transferRequests.result })
        .from(transferRequests)
        .where(eq(transferRequests.id, request.requestId));

      if (done) return done.result;

      const rows = await inOrder(
        request.rows,
        async ({ rowNumber, values }): Promise<RowResult> => ({
          rowNumber,
          ...(await tx
            .transaction((savepoint) => row(savepoint, values))
            .catch((error: unknown) => ({ action: 'error' as const, error: reasonOf(error) }))),
        }),
      );

      if (request.dryRun) throw new DryRun(rows);

      // Core retries a batch within minutes; a day-old result answers nothing.
      await tx
        .delete(transferRequests)
        .where(lt(transferRequests.createdAt, sql`now() - interval '1 day'`));
      await tx
        .insert(transferRequests)
        .values({ id: request.requestId, orgId: request.orgId, result: { rows } });

      return { rows };
    });
  } catch (error) {
    if (error instanceof DryRun) return { rows: error.rows };

    throw error;
  }
};

/** One exported cell, as core writes it: a list `; `-joined, true and false as yes and no. */
type Cell = z.infer<typeof PluginExportPage>['rows'][number][string];

/** A row of `cells` in the file's `columns`; a column the type doesn't fill stays empty. */
export const rowOf = (columns: string[], cells: Record<string, Cell>) =>
  Object.fromEntries(columns.map((key) => [key, cells[key] ?? null]));

/** A cell as a list: `; ` or new lines between items, as exports write them. */
export const listOf = (cell: string | undefined) =>
  (cell ?? '')
    .split(/;|\n/)
    .map((item) => item.trim())
    .filter(Boolean);

/** A row error, in words the member's error report shows. */
export const refuse = (message: string) => new ORPCError('BAD_REQUEST', { message });

/**
 * A `Label: value` list cell, as exports write a record's answers or fields, by the item each
 * of `items` labels. An item starts where a part begins with its label, the longest first, so a
 * label may hold `:` and a value `; `.
 */
export const labelledOf = <T extends { label: string }>(cell: string, items: T[]) => {
  const named = items
    .filter((item) => item.label)
    .toSorted((a, b) => b.label.length - a.label.length);

  const found: { item: T; text: string }[] = [];

  for (const part of cell.split(/; |\n/)) {
    const item = named.find((one) => part.startsWith(`${one.label}:`));
    const last = found.at(-1);

    if (item) found.push({ item, text: part.slice(item.label.length + 1).trim() });
    else if (last) last.text = `${last.text}; ${part}`;
    else if (part.trim()) throw refuse(`Write each one as Label: value; no label matches ${part}`);
  }

  return found;
};

/** A yes or no cell, as exports write a tick. */
export const tickOf = (text: string, label: string) => {
  const word = text.toLowerCase();

  if (word === 'yes' || word === 'true') return true;

  if (word === 'no' || word === 'false') return false;

  throw refuse(`${label} is yes or no`);
};

/** A date cell, or a row error naming the column. */
export const dateOf = (cell: string | undefined, column: string) => {
  if (!cell) return undefined;

  const date = new Date(cell);

  if (Number.isNaN(date.getTime())) throw refuse(`${column} is not a date: ${cell}`);

  return date;
};
