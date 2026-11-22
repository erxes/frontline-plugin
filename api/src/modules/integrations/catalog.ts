import type { PluginManifest } from '@erxes/core-contract';
import { count, sql } from 'drizzle-orm';
import { withOrg } from '#/db/client.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { PLUGIN } from '#/config.ts';
import { core, PERMISSIONS } from '#/core.ts';
import { logger } from '#/logger.ts';
import type { ProviderName } from './provider.ts';

/**
 * Frontline's integrations in core's Settings › Integrations, one an organisation sets up once
 * for every channel: its accounts connect there, and each channel picks the ones that bring it
 * conversations. Meta's login connects Facebook pages and Instagram accounts alike.
 */
/** One of frontline's integrations: its manifest listing and the account providers it covers. */
type Listing = Omit<NonNullable<PluginManifest['integrations']>[number], 'permission'> & {
  providers: ProviderName[];
};

const INTEGRATIONS: Listing[] = [
  {
    key: 'meta',
    providers: ['facebook', 'instagram'],
    name: 'Facebook and Instagram',
    summary: 'Messenger chats, post comments and Instagram messages, answered in the inbox',
    category: 'social',
  },
  {
    key: 'telegram',
    providers: ['telegram'],
    name: 'Telegram bot',
    summary: 'Chats with your Telegram bot, answered in the inbox',
    category: 'messaging',
  },
  {
    key: 'discord',
    providers: ['discord'],
    name: 'Discord bot',
    summary: 'Messages to your Discord bot, answered in the inbox',
    category: 'messaging',
  },
  {
    key: 'mail',
    providers: ['mail'],
    name: 'Mailbox',
    summary: 'A mailbox whose mail lands in the inbox and is answered from it',
    category: 'email',
  },
  {
    key: 'call',
    providers: ['call'],
    name: 'Grandstream PBX',
    summary: 'Calls through your Grandstream PBX, logged in the inbox with a softphone',
    category: 'messaging',
  },
  {
    key: 'callpro',
    providers: ['callpro'],
    name: 'CallPro',
    summary: 'Calls through a CallPro line, logged in the inbox',
    category: 'messaging',
    countries: ['MN'],
  },
];

/** The integration whose accounts `provider` connects: `meta` for Facebook and Instagram. */
export const integrationKeyOf = (provider: ProviderName) =>
  INTEGRATIONS.find((integration) => integration.providers.includes(provider))?.key ?? provider;

/** The page of `provider`'s integration in core's Settings › Integrations, on its accounts. */
export const integrationPage = (provider: ProviderName) =>
  `/settings/integrations/${PLUGIN}.${integrationKeyOf(provider)}?tab=accounts`;

/** The manifest's `integrations`, each managed with the integrations permission. */
export const MANIFEST_INTEGRATIONS = INTEGRATIONS.map(({ providers, ...listing }) => ({
  ...listing,
  permission: PERMISSIONS.integrationManage,
}));

/**
 * Tells core where each of the organisation's integrations stands: not set up without accounts,
 * attention while one is broken, else connected, with how many accounts it has.
 */
export const reportIntegrations = async (orgId: string) => {
  const rows = await withOrg(orgId, (tx) =>
    tx
      .select({
        provider: integrationAccounts.provider,
        total: count(),
        broken: sql<number>`count(*) filter (where ${integrationAccounts.status} = 'broken')::int`,
      })
      .from(integrationAccounts)
      .groupBy(integrationAccounts.provider),
  );

  await Promise.all(
    INTEGRATIONS.map(({ key, providers }) => {
      const own = rows.filter((row) => providers.some((provider) => provider === row.provider));
      const total = own.reduce((sum, row) => sum + row.total, 0);
      const broken = own.some((row) => row.broken > 0);
      const state = total === 0 ? 'not-set-up' : broken ? 'attention' : 'connected';

      return core.reportIntegration(orgId, key, state, total);
    }),
  );
};

/** The organisations whose report waits, so a burst of changes sends one. */
const waiting = new Set<string>();

/** How long a report waits after a change, for its transaction to commit and more to come. */
const REPORT_AFTER_MS = 2000;

/**
 * Reports the organisation's integrations shortly after an account changes, once its
 * transaction has committed. A failed report is logged; the daily account check sends it again.
 */
export const reportSoon = (orgId: string) => {
  if (waiting.has(orgId)) return;

  waiting.add(orgId);
  setTimeout(() => {
    waiting.delete(orgId);
    reportIntegrations(orgId).catch((error: unknown) => {
      logger.warn({ err: error, orgId }, 'integration states not reported');
    });
  }, REPORT_AFTER_MS).unref();
};
