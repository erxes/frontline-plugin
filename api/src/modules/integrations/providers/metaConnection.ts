import { LRUCache } from 'lru-cache';
import { config } from '#/config.ts';
import { core, refusedByCore } from '#/core.ts';
import type { AccountRow } from '../provider.ts';

/**
 * Core's integration whose connections Facebook pages and Instagram accounts come through: the
 * organisation connects Facebook once in core, for core's automations and for frontline.
 */
export const FACEBOOK = 'facebook';

/**
 * Core's Settings › Integrations › Facebook, where an organisation connects Facebook and sets its
 * own Meta app.
 */
export const FACEBOOK_SETTINGS = `/settings/integrations/${FACEBOOK}`;

/** Each connection's app secret, by connection id; null for one core no longer gives. */
type Known = { appSecret: string | null };

/** How long a connection's app secret is kept: core audits every `credentials` read. */
const KEEP_MS = 60 * 60_000;

/** How long a connection core refused is remembered, so a flood of deliveries asks core once. */
const REFUSED_MS = 5 * 60_000;

const appSecrets = new LRUCache<string, Known, string>({
  max: 10_000,
  ttl: KEEP_MS,
  fetchMethod: async (connectionId, _stale, { context: orgId, options }) => {
    try {
      const { appSecret } = await core.forOrg(orgId).integrations.credentials({ id: connectionId });

      return { appSecret };
    } catch (error) {
      if (!refusedByCore(error)) throw error;

      // Removed, turned off or no longer approved: its pages' deliveries take the install's only.
      options.ttl = REFUSED_MS;

      return { appSecret: null };
    }
  },
});

/**
 * A fresh token of the organisation's Facebook connection, and the Meta app it signed in through,
 * from core (which audits the read). The app's secret is kept for the webhook's signatures.
 */
export const credentialsOf = async (orgId: string, connectionId: string) => {
  const credentials = await core.forOrg(orgId).integrations.credentials({ id: connectionId });

  appSecrets.set(connectionId, { appSecret: credentials.appSecret });

  return credentials;
};

/**
 * Reads the connection's app again on its next use: core said it changed, or Meta refused a
 * token that came through it.
 */
export const forgetConnection = (connectionId: string | null) => {
  if (connectionId) appSecrets.delete(connectionId);
};

/**
 * The secrets Meta may sign an account's deliveries with: the install's app, which meta-relay
 * forwards, and the app the account's core connection signed in through, the organisation's own
 * or the same one.
 */
export const metaSecretsOf = async ({
  orgId,
  connectionId,
}: Pick<AccountRow, 'orgId' | 'connectionId'>) => {
  const own = connectionId
    ? (await appSecrets.fetch(connectionId, { context: orgId }))?.appSecret
    : null;

  return [config.meta.appSecret, own].filter((secret) => typeof secret === 'string');
};

/** Whether Meta's address check names the install's verify token (`META_VERIFY_TOKEN`). */
export const knownVerifyToken = (token: string) =>
  config.meta.verifyToken !== undefined && token === config.meta.verifyToken;
