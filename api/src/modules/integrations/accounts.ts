import { ORPCError } from '@orpc/server';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { core, INTEGRATION_BROKEN, PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { integrationAccounts, PROVIDERS } from '#/db/integrations.ts';
import { logger } from '#/logger.ts';
import { reads, writes, writesWithCore } from '#/orpc.ts';
import type { AccountRow } from './provider.ts';
import { providerOf } from './providers/index.ts';
import { Account, accountColumns, accountRow, removeWebhookKeys } from './store.ts';

/**
 * Asks the provider whether `row` still works and records the answer in its own transaction.
 * Whoever connected an account that just broke hears of it.
 */
export const checkAccount = async (row: AccountRow) => {
  const error = await providerOf(row.provider)
    .open(row)
    .check()
    .catch((failure: unknown) => (failure instanceof Error ? failure.message : String(failure)));

  const [checked] = await withOrg(row.orgId, (tx) =>
    tx
      .update(integrationAccounts)
      .set({ status: error ? 'broken' : 'healthy', error, checkedAt: sql`now()` })
      .where(eq(integrationAccounts.id, row.id))
      .returning(accountColumns),
  );

  if (!checked) throw new ORPCError('NOT_FOUND', { message: 'No such integration account' });

  if (error && row.status === 'healthy')
    await core
      .forOrg(row.orgId)
      .notifications.create({
        kind: INTEGRATION_BROKEN,
        title: `${row.name} stopped working`,
        body: error,
        link: '/frontline/settings/integrations',
        userIds: [row.createdBy],
        dedupeKey: `integration-broken:${row.id}:${checked.checkedAt?.toISOString() ?? ''}`,
      })
      .catch((failure: unknown) => {
        logger.error({ err: failure, accountId: row.id }, 'broken integration notification failed');
      });

  return checked;
};

/** The organisation's connected accounts, one provider's or all, by provider then name. */
const list = reads(PERMISSIONS.integrationView)
  .input(z.object({ provider: z.enum(PROVIDERS).optional() }))
  .output(z.object({ accounts: z.array(Account) }))
  .handler(async ({ input, context: { tx } }) => {
    const accounts = await tx
      .select(accountColumns)
      .from(integrationAccounts)
      .where(input.provider ? eq(integrationAccounts.provider, input.provider) : undefined)
      .orderBy(integrationAccounts.provider, integrationAccounts.name, integrationAccounts.id);

    return { accounts };
  });

/**
 * Asks the provider whether the account still works, and marks it healthy or broken. The
 * provider is asked before any transaction opens, so a slow one holds no connection.
 */
const check = writesWithCore(
  PERMISSIONS.integrationManage,
  z.object({ id: z.string() }),
  async (member, input) =>
    checkAccount(await withOrg(member.orgId, (tx) => accountRow(tx, input.id))),
)
  .output(Account)
  .handler(({ context: { fromCore } }) => fromCore);

/**
 * Disconnects the accounts: their keys go, then the provider stops sending their events. A
 * provider that can't be reached doesn't keep an account: it is removed anyway and logged.
 */
const remove = writes(PERMISSIONS.integrationManage)
  .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member, afterCommit } }) => {
    const rows = await tx
      .select()
      .from(integrationAccounts)
      .where(inArray(integrationAccounts.id, input.ids));

    if (rows.length !== new Set(input.ids).size)
      throw new ORPCError('NOT_FOUND', { message: 'No such integration account' });

    for (const row of rows)
      afterCommit(() =>
        providerOf(row.provider)
          .open(row)
          .disconnect()
          .catch((error: unknown) => {
            logger.warn(
              { err: error, accountId: row.id, provider: row.provider },
              'disconnect failed',
            );
          }),
      );

    await removeWebhookKeys(tx, member.orgId, input.ids);

    const removed = await tx
      .delete(integrationAccounts)
      .where(inArray(integrationAccounts.id, input.ids))
      .returning({ id: integrationAccounts.id });

    return { ids: removed.map((row) => row.id) };
  });

export const accountProcedures = { list, check, remove };
