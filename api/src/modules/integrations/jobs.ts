import type { PluginJobDelivery } from '@erxes/core-contract';
import { eq, sql } from 'drizzle-orm';
import pLimit from 'p-limit';
import { z } from 'zod';
import { type Tx, withOrg } from '#/db/client.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { logger } from '#/logger.ts';
import { checkAccount, recordCheck } from './accounts.ts';
import { deliverInbound } from './inbound.ts';
import type { AccountRow } from './provider.ts';
import { mail, pullMail, SyncState, syncFailure } from './providers/mail.ts';
import { suppress } from './providers/mailSuppressions.ts';

const accountsOf = (orgId: string, provider?: 'mail') =>
  withOrg(orgId, (tx) =>
    tx
      .select()
      .from(integrationAccounts)
      .where(provider ? eq(integrationAccounts.provider, provider) : undefined),
  );

/** imapflow's mark on an error for a login the server refused. */
const LoginRefused = z.object({ authenticationFailed: z.literal(true) });

/** How many of an organisation's accounts are read or checked at once. */
const ACCOUNTS_AT_ONCE = 4;

/** Runs `step` on each account, `ACCOUNTS_AT_ONCE` at a time. */
const eachAccount = async (rows: AccountRow[], step: (row: AccountRow) => Promise<unknown>) => {
  const limit = pLimit(ACCOUNTS_AT_ONCE);

  await Promise.all(rows.map((row) => limit(() => step(row))));
};

/** Notes that the mailbox was read up to `state`, so the next run starts after it. */
const saveSyncState = (tx: Tx, accountId: string, state: z.infer<typeof SyncState>) =>
  tx
    .update(integrationAccounts)
    .set({ syncState: state, status: 'healthy', error: null, checkedAt: sql`now()` })
    .where(eq(integrationAccounts.id, accountId));

/**
 * Logs a failed sync of `row` and counts it, with its error, in its sync state; once the mailbox
 * has failed too many runs in a row (`syncFailure`) it is marked broken. A run that gets anywhere
 * starts the count over.
 */
const failedSync = async (row: AccountRow, error: unknown) => {
  logger.error({ err: error, accountId: row.id }, 'mail sync failed');

  const [counted] = await withOrg(row.orgId, (tx) =>
    tx
      .update(integrationAccounts)
      .set({
        syncState: sql`${integrationAccounts.syncState} || jsonb_build_object('failedRuns', coalesce((${integrationAccounts.syncState}->>'failedRuns')::int, 0) + 1, 'failure', ${error instanceof Error ? error.message : String(error)}::text)`,
      })
      .where(eq(integrationAccounts.id, row.id))
      .returning({ syncState: integrationAccounts.syncState }),
  );

  const failure = syncFailure(counted?.syncState);

  if (failure) await recordCheck(row, failure);
};

/**
 * Reads up to a run's worth of what reached each of the organisation's mailboxes since the last
 * run and hands it to the inbox, and notes the addresses its reports said to stop mailing. Each
 * message is kept with the mailbox's place after it, so a failure leaves the messages before it
 * in place and the next run starts at it; a mail the inbox can never store is skipped. A mailbox
 * that refuses the login is marked broken at once, and one that keeps failing for any
 * other reason, such as a server that doesn't answer, after five runs. The rest go on.
 */
export const syncMail = async (job: PluginJobDelivery) => {
  const sync = async (row: AccountRow) => {
    const { account } = mail.open(row);

    const pulled = await pullMail(
      account.config.imap,
      account.secret.imapPassword,
      row.externalId,
      SyncState.safeParse(row.syncState).data ?? null,
    ).catch((error: unknown) => {
      if (!LoginRefused.safeParse(error).success) throw error;

      logger.warn({ err: error, accountId: row.id }, 'mailbox refused the login');

      return null;
    });

    if (!pulled) {
      await checkAccount(row);

      return;
    }

    const { uidValidity } = pulled.state;

    await withOrg(job.orgId, (tx) => suppress(tx, job.orgId, row.id, pulled.suppressed));
    await deliverInbound(
      row,
      pulled.messages.map(({ uid, message }) => ({ ...message, uid })),
      (tx, { uid }) => saveSyncState(tx, row.id, { uidValidity, lastUid: uid }),
    );
    await withOrg(job.orgId, (tx) => saveSyncState(tx, row.id, pulled.state));
  };

  await eachAccount(await accountsOf(job.orgId, 'mail'), (row) =>
    sync(row)
      .catch((error: unknown) => failedSync(row, error))
      .catch((error: unknown) => {
        logger.error({ err: error, accountId: row.id }, 'failed mail sync not recorded');
      }),
  );
};

/** Asks each provider whether the organisation's accounts still work, once a day. */
export const checkAccounts = async (job: PluginJobDelivery) => {
  await eachAccount(await accountsOf(job.orgId), checkAccount);
};
