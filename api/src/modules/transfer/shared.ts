import type {
  PluginExportPage,
  PluginImportRequest,
  PluginImportResult,
} from '@erxes/core-contract';
import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { eq, sql } from 'drizzle-orm';
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

/** A date cell, or a row error naming the column. */
export const dateOf = (cell: string | undefined, column: string) => {
  if (!cell) return undefined;

  const date = new Date(cell);

  if (Number.isNaN(date.getTime()))
    throw new ORPCError('BAD_REQUEST', { message: `${column} is not a date: ${cell}` });

  return date;
};
