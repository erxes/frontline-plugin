import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { type Tx, withOrg } from '#/db/client.ts';
import { integrationAccounts, PROVIDERS } from '#/db/integrations.ts';
import { publicKeys } from '#/db/public.ts';
import { openedBy, removeKeys } from '../public.ts';
import type { ProviderName, Routed } from './provider.ts';
import { sealSecret } from './secrets.ts';

/** The row without `org_id`, which the caller knows, and the sealed secret, which nobody reads. */
const { orgId, secret, ...columns } = getTableColumns(integrationAccounts);

export const accountColumns = columns;

export const Account = createSelectSchema(integrationAccounts).omit({ orgId: true, secret: true });

/** What a provider found when it connected an account. */
interface Connected {
  provider: ProviderName;
  externalId: string;
  name: string;
  config: Record<string, unknown>;
  secret: Record<string, unknown>;
  syncState?: Record<string, unknown>;
  /**
   * The key a webhook delivery names it by, a `frontline_public_keys` row: Meta's page id
   * (`metaKey`), or the random key in a Telegram webhook's address.
   */
  webhookKey?: string;
}

/**
 * Stores what a provider connected for `member`, or refreshes the account when it was connected
 * before, and points its webhook routes at it. Returns the account as `Account` shows it.
 */
export const saveAccount = async (
  tx: Tx,
  member: Pick<PluginMember, 'orgId' | 'userId'>,
  connected: Connected,
) => {
  const sealed = sealSecret(member.orgId, connected.secret);
  const syncState = connected.syncState ?? {};

  const [row] = await tx
    .insert(integrationAccounts)
    .values({
      orgId: member.orgId,
      provider: connected.provider,
      externalId: connected.externalId,
      name: connected.name,
      config: connected.config,
      secret: sealed,
      syncState,
      checkedAt: sql`now()`,
      createdBy: member.userId,
    })
    .onConflictDoUpdate({
      target: [
        integrationAccounts.orgId,
        integrationAccounts.provider,
        integrationAccounts.externalId,
      ],
      set: {
        name: connected.name,
        config: connected.config,
        secret: sealed,
        syncState,
        status: 'healthy',
        error: null,
        checkedAt: sql`now()`,
      },
    })
    .returning(accountColumns);

  if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR');

  if (connected.webhookKey) {
    // A reconnect issues a new key, so the old one stops leading anywhere. A page another
    // organisation connected before moves here: Meta sends its events to one place.
    await removeWebhookKeys(tx, member.orgId, [row.id]);
    await tx
      .insert(publicKeys)
      .values({
        key: connected.webhookKey,
        orgOf: member.orgId,
        kind: connected.provider,
        targetId: row.id,
      })
      .onConflictDoUpdate({
        target: publicKeys.key,
        set: { orgOf: member.orgId, kind: connected.provider, targetId: row.id },
      });
  }

  return row;
};

/** Stops the webhook keys of the organisation's accounts leading anywhere. */
export const removeWebhookKeys = (tx: Tx, organizationId: string, accountIds: string[]) =>
  removeKeys(
    tx,
    organizationId,
    and(inArray(publicKeys.kind, PROVIDERS), inArray(publicKeys.targetId, accountIds)),
  );

/** The account a delivery's key opens, with its secret. */
export const accountOf = async ({ provider, key }: Pick<Routed, 'provider' | 'key'>) => {
  const route = await openedBy(key, [provider]);

  if (!route) return null;

  const [row] = await withOrg(route.orgOf, (tx) =>
    tx.select().from(integrationAccounts).where(eq(integrationAccounts.id, route.targetId)),
  );

  return row ?? null;
};

/** The key Meta's deliveries name an account by: its page or Instagram account id. */
export const metaKey = (provider: ProviderName, externalId: string) => `${provider}:${externalId}`;

/** The account `id` with its secret, for the provider's calls. */
export const accountRow = async (tx: Tx, id: string) => {
  const [row] = await tx.select().from(integrationAccounts).where(eq(integrationAccounts.id, id));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such integration account' });

  return row;
};
