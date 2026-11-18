import { config } from '#/config.ts';
import { accountOf, metaKey } from '../store.ts';

/**
 * meta-relay forwards Meta's deliveries for a page to every install that routed it, so frontline
 * and an older erxes install can share one Meta app on the same pages. It routes by the ids
 * Meta's `entry[].id` carries: the page id under `facebook`, the Instagram account id under
 * `instagram`, the same ids `metaKey` stores.
 */
type Kind = 'facebook' | 'instagram';

const TIMEOUT_MS = 15_000;

const relayCall = async (method: 'PUT' | 'DELETE', kind: Kind, id: string) => {
  const relay = config.meta.relay;

  if (!relay) return null;

  return fetch(`${relay.url}/v1/routes/${kind}/${encodeURIComponent(id)}`, {
    method,
    headers: { authorization: `Bearer ${relay.key}`, 'content-type': 'application/json' },
    body:
      method === 'PUT'
        ? JSON.stringify({ url: `${config.publicUrl}/api/public/webhooks/meta` })
        : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((error: unknown) => {
    throw new Error('The Meta relay did not answer', { cause: error });
  });
};

/** Has meta-relay send the page's or account's deliveries to frontline's webhook. */
export const routeThroughRelay = async (kind: Kind, id: string) => {
  const response = await relayCall('PUT', kind, id);

  if (response && !response.ok)
    throw new Error(`The Meta relay refused the ${kind} account: ${response.status}`);
};

/**
 * Stops meta-relay sending the page's or account's deliveries here, unless another organisation
 * connected it since and still takes them. A route that is already gone counts as removed.
 */
export const unrouteFromRelay = async (kind: Kind, id: string) => {
  if (!config.meta.relay || (await accountOf({ provider: kind, key: metaKey(kind, id) }))) return;

  const response = await relayCall('DELETE', kind, id);

  if (response && !response.ok && response.status !== 404)
    throw new Error(`The Meta relay refused to remove the ${kind} account: ${response.status}`);
};
