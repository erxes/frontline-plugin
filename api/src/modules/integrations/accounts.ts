import { ORPCError } from '@orpc/server';
import { eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { INTEGRATION_BROKEN, PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { integrationAccounts, PROVIDERS } from '#/db/integrations.ts';
import { logger } from '#/logger.ts';
import { reads, writes, writesWithCore } from '#/orpc.ts';
import { notifyMembers } from '../notify.ts';
import { AccountRefused, type AccountRow } from './provider.ts';
import { providerOf } from './providers/index.ts';
import { Account, accountColumns, accountRow, removeWebhookKeys, webhookKeyOf } from './store.ts';
import { integrationPage, reportSoon } from './catalog.ts';

/**
 * Asks the provider whether `row` still works and records the answer, after pointing its events
 * at frontline again when `repair` names the account's webhook key.
 */
export const checkAccount = async (row: AccountRow, repair?: { webhookKey: string | null }) => {
  const error = await Promise.resolve()
    .then(async () => {
      const provider = providerOf(row.provider).open(row);

      if (repair) await provider.repair(repair.webhookKey);

      return provider.check();
    })
    .catch((failure: unknown) => (failure instanceof Error ? failure.message : String(failure)));

  return recordCheck(row, error);
};

/**
 * Records in its own transaction whether `row` works: healthy, or broken with `error`. Whoever
 * connected an account that just broke hears of it once: the row stays locked while it changes,
 * so of two replies that find the token refused at once, only the first tells.
 */
export const recordCheck = async (row: AccountRow, error: string | null) => {
  const { checked, wasHealthy } = await withOrg(row.orgId, async (tx) => {
    const [locked] = await tx
      .select({ status: integrationAccounts.status })
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, row.id))
      .for('update');

    const [updated] = await tx
      .update(integrationAccounts)
      .set({ status: error ? 'broken' : 'healthy', error, checkedAt: sql`now()` })
      .where(eq(integrationAccounts.id, row.id))
      .returning(accountColumns);

    return { checked: updated, wasHealthy: locked?.status === 'healthy' };
  });

  if (!checked) throw new ORPCError('NOT_FOUND', { message: 'No such integration account' });

  reportSoon(row.orgId);

  if (error && wasHealthy)
    await notifyMembers(row.orgId, {
      kind: INTEGRATION_BROKEN,
      title: 'An integration stopped working',
      body: `${row.name}: ${error}`,
      link: integrationPage(row.provider),
      userIds: [row.createdBy],
      dedupeKey: `integration-broken:${row.id}:${checked.checkedAt?.toISOString() ?? ''}`,
    });

  return checked;
};

/**
 * Marks `row` broken when `error` is the provider refusing its token, or wraps one, as a reply
 * the provider took part of does. A failure to record it is logged, so `error` stays the one the
 * caller sees.
 */
export const markRefused = async (row: AccountRow, error: unknown) => {
  const refused =
    error instanceof Error && error.cause instanceof AccountRefused ? error.cause : error;

  if (!(refused instanceof AccountRefused)) return;

  await recordCheck(row, refused.message).catch((failure: unknown) => {
    logger.error({ err: failure, accountId: row.id }, 'refused account not marked broken');
  });
};

/**
 * The organisation's connected accounts, one provider's or all, by provider then name, and
 * whether the caller may connect and change them.
 */
const list = reads(PERMISSIONS.integrationView)
  .input(z.object({ provider: z.enum(PROVIDERS).optional() }))
  .output(z.object({ accounts: z.array(Account), canManage: z.boolean() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const accounts = await tx
      .select(accountColumns)
      .from(integrationAccounts)
      .where(input.provider ? eq(integrationAccounts.provider, input.provider) : undefined)
      .orderBy(integrationAccounts.provider, integrationAccounts.name, integrationAccounts.id);

    return { accounts, canManage: member.can(PERMISSIONS.integrationManage) };
  });

/**
 * Repair, as the old plugin had it: points the provider's events at frontline again (Meta's page
 * subscription and relay route, Telegram's webhook), then asks whether the account works and
 * marks it healthy or broken. The provider is asked before any transaction opens, so a slow one
 * holds no connection.
 */
const repair = writesWithCore(
  PERMISSIONS.integrationManage,
  z.object({ id: z.string() }),
  async (member, input) => {
    const [row, webhookKey] = await withOrg(member.orgId, async (tx) => {
      const account = await accountRow(tx, input.id);

      return [account, await webhookKeyOf(tx, account)] as const;
    });

    return checkAccount(row, { webhookKey });
  },
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

    reportSoon(member.orgId);

    return { ids: removed.map((row) => row.id) };
  });

export const accountProcedures = { list, repair, remove };
