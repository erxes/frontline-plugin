import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { type Tx, withOrg } from '#/db/client.ts';
import { integrationAccounts, PROVIDERS } from '#/db/integrations.ts';
import { publicKeys } from '#/db/public.ts';
import { channels } from '#/db/schema.ts';
import { channelFor } from '../channels/access.ts';
import { channelServing, insertIntegration } from '../inbox/insertIntegration.ts';
import { openedBy, removeKeys } from '../public.ts';
import type { AccountRow, ProviderName, Routed } from './provider.ts';
import { sealSecret } from './secrets.ts';
import { reportSoon } from './catalog.ts';

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
  /** The core connection it came through: a Facebook page or Instagram account's. */
  connectionId?: string;
}

/** A connect's channel: the one its form was opened from, which the account joins. */
export const Into = { channelId: z.string().optional() };

/** `channelId` once `member` is shown to be its admin, for `saveAccount` to join. */
export const intoChannel = async (tx: Tx, member: PluginMember, channelId: string | undefined) => {
  if (channelId) await channelFor(tx, member, channelId, { change: true });

  return channelId;
};

/**
 * `intoChannel` in a transaction of its own, for a connect that changes something at the
 * provider first, so a refused channel leaves the provider as it was.
 */
export const checkInto = (member: PluginMember, channelId: string | undefined) =>
  withOrg(member.orgId, (tx) => intoChannel(tx, member, channelId));

/**
 * Adds the account to the channel as an integration, unless it serves a channel already
 * (`channelServing`) or the channel was deleted since the connect began.
 */
const joinChannel = async (
  tx: Tx,
  by: Pick<PluginMember, 'orgId' | 'userId'>,
  account: { id: string; provider: ProviderName; name: string },
  channelId: string,
) => {
  const [channel] = await tx
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.id, channelId));

  if (channel && !(await channelServing(tx, account.id, channelId)))
    await insertIntegration(tx, by, {
      channelId,
      kind: account.provider,
      name: account.name,
      config: { accountId: account.id },
    });
};

/**
 * Stores what a provider connected for `member`, or refreshes the account when it was connected
 * before, and points its webhook routes at it. With `channelId`, checked by `intoChannel`, the
 * account joins that channel too. Returns the account as `Account` shows it.
 */
export const saveAccount = async (
  tx: Tx,
  member: Pick<PluginMember, 'orgId' | 'userId'>,
  connected: Connected,
  channelId?: string,
) => {
  const sealed = sealSecret(member.orgId, connected.secret);
  const syncState = connected.syncState ?? {};
  const connectionId = connected.connectionId ?? null;

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
      connectionId,
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
        connectionId,
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

  if (channelId) await joinChannel(tx, member, row, channelId);

  reportSoon(member.orgId);

  return row;
};

/** Stops the webhook keys of the organisation's accounts leading anywhere. */
export const removeWebhookKeys = (tx: Tx, organizationId: string, accountIds: string[]) =>
  removeKeys(
    tx,
    organizationId,
    and(inArray(publicKeys.kind, PROVIDERS), inArray(publicKeys.targetId, accountIds)),
  );

/** The key the account's webhook deliveries name it by, or null for one that takes none. */
export const webhookKeyOf = async (tx: Tx, row: Pick<AccountRow, 'id' | 'provider'>) => {
  const [found] = await tx
    .select({ key: publicKeys.key })
    .from(publicKeys)
    .where(and(eq(publicKeys.kind, row.provider), eq(publicKeys.targetId, row.id)));

  return found?.key ?? null;
};

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
