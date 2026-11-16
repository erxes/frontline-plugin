import type { PluginJobDelivery } from '@erxes/core-contract';
import { eq, sql } from 'drizzle-orm';
import { withOrg } from '#/db/client.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { logger } from '#/logger.ts';
import { checkAccount } from './accounts.ts';
import { deliverInbound } from './adapters.ts';
import type { AccountRow } from './provider.ts';
import { mail, pullMail, SyncState } from './providers/mail.ts';
import { suppress } from './providers/mailSuppressions.ts';

const accountsOf = (orgId: string, provider?: 'mail') =>
  withOrg(orgId, (tx) =>
    tx
      .select()
      .from(integrationAccounts)
      .where(provider ? eq(integrationAccounts.provider, provider) : undefined),
  );

/**
 * Reads what reached each of the organisation's mailboxes since the last run and hands it to the
 * inbox, notes the addresses its reports said to stop mailing, then where it left off. A mailbox
 * that refuses the login is marked broken and the rest go on; a failure handing mail to the inbox
 * throws, so the next run reads it again.
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
      logger.warn({ err: error, accountId: row.id }, 'mailbox refused the sync');

      return null;
    });

    if (!pulled) {
      await checkAccount(row);

      return;
    }

    await deliverInbound(row, pulled.messages);
    await withOrg(job.orgId, async (tx) => {
      await suppress(tx, job.orgId, row.id, pulled.suppressed);
      await tx
        .update(integrationAccounts)
        .set({ syncState: pulled.state, status: 'healthy', error: null, checkedAt: sql`now()` })
        .where(eq(integrationAccounts.id, row.id));
    });
  };

  await Promise.all((await accountsOf(job.orgId, 'mail')).map(sync));
};

/** Asks each provider whether the organisation's accounts still work, once a day. */
export const checkAccounts = async (job: PluginJobDelivery) => {
  await Promise.all((await accountsOf(job.orgId)).map(checkAccount));
};
