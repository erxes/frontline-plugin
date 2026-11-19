import { config } from '#/config.ts';
import { providerApi, ProviderRefused } from '../providerApi.ts';
import { accountOf, metaKey } from '../store.ts';

/**
 * meta-relay forwards Meta's deliveries for a page to every install that routed it, so frontline
 * and an older erxes install can share one Meta app on the same pages. It routes by the ids
 * Meta's `entry[].id` carries: the page id under `facebook`, the Instagram account id under
 * `instagram`, the same ids `metaKey` stores.
 */
type Kind = 'facebook' | 'instagram';

const relayApi = providerApi({ name: 'The Meta relay', timeout: 15_000 });

const relayCall = (method: 'put' | 'delete', kind: Kind, id: string) => {
  const relay = config.meta.relay;

  if (!relay) return null;

  return relayApi[method](`${relay.url}/v1/routes/${kind}/${encodeURIComponent(id)}`, {
    headers: { authorization: `Bearer ${relay.key}` },
    json: method === 'put' ? { url: `${config.publicUrl}/api/public/webhooks/meta` } : undefined,
  });
};

/** Has meta-relay send the page's or account's deliveries to frontline's webhook. */
export const routeThroughRelay = async (kind: Kind, id: string) => {
  await relayCall('put', kind, id);
};

/**
 * Stops meta-relay sending the page's or account's deliveries here, unless another organisation
 * connected it since and still takes them. A route that is already gone counts as removed.
 */
export const unrouteFromRelay = async (kind: Kind, id: string) => {
  if (!config.meta.relay || (await accountOf({ provider: kind, key: metaKey(kind, id) }))) return;

  await relayCall('delete', kind, id)?.catch((error: unknown) => {
    if (!(error instanceof ProviderRefused) || error.status !== 404) throw error;
  });
};
