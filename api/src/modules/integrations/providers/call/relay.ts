import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '#/config.ts';
import type { Tx } from '#/db/client.ts';
import { callQueues } from '#/db/calls.ts';
import { providerApi, ProviderRefused } from '../../providerApi.ts';

/**
 * pbx-relay holds each Grandstream UCM's CDR feed and API session, and forwards a call or queue
 * event to the install whose route holds its trunk or queue. Each PBX account is one route, by
 * its id: the UCM, the account's webhook address and secret, and the trunks and queues it takes.
 */

/**
 * The key two names of one trunk share: trimmed, lowercased, `-` read as `_`, so `EMJJ-Tuv` and
 * `emjj_tuv` are the same trunk, as pbx-relay keys them.
 */
export const trunkKey = (name: string) => name.trim().toLowerCase().replaceAll('-', '_');

/** What pbx-relay answers a route it refuses with 409: the trunks and queues another route holds. */
const Taken = z.object({
  conflicts: z.array(z.object({ kind: z.enum(['trunk', 'queue']), value: z.string() })),
});

/** pbx-relay's refusal in words a member can act on. */
const refusalOf = (body: unknown, status: number) => {
  if (status === 404) return { why: 'it does not serve this PBX' };

  const taken = Taken.safeParse(body).data?.conflicts ?? [];

  if (status !== 409 || taken.length === 0) return {};

  const named = taken.map(({ kind, value }) => `${kind} ${value}`).join(', ');

  return { why: `another erxes install or organisation routes ${named} on this PBX` };
};

const relayApi = providerApi({ name: 'pbx-relay', readError: refusalOf });

/** The PBX account a route is for, as its settings and secret hold it. */
interface RoutedPbx {
  id: string;
  host: string;
  srcTrunk: string;
  dstTrunk: string;
  webhookSecret: string;
}

/** The trunks a route holds: the account's that aren't blank, each key once, as first named. */
const trunksOf = ({ srcTrunk, dstTrunk }: Pick<RoutedPbx, 'srcTrunk' | 'dstTrunk'>) => {
  const named = [srcTrunk, dstTrunk].map((trunk) => trunk.trim()).filter(Boolean);

  return named.filter(
    (trunk, at) => named.findIndex((other) => trunkKey(other) === trunkKey(trunk)) === at,
  );
};

/** Whether two settings of a PBX route the same trunks and queues. */
export const sameRoute = (
  [one, oneQueues]: [Pick<RoutedPbx, 'srcTrunk' | 'dstTrunk'>, string[]],
  [other, otherQueues]: [Pick<RoutedPbx, 'srcTrunk' | 'dstTrunk'>, string[]],
) => {
  const keyOf = (pbx: typeof one, queues: string[]) =>
    JSON.stringify([trunksOf(pbx).map(trunkKey).toSorted(), queues.toSorted()]);

  return keyOf(one, oneQueues) === keyOf(other, otherQueues);
};

/** The queues frontline follows on the account's PBX. */
export const followedQueues = async (tx: Tx, accountId: string) =>
  (
    await tx
      .select({ queue: callQueues.queue })
      .from(callQueues)
      .where(eq(callQueues.accountId, accountId))
  ).map(({ queue }) => queue);

/** The address a phone account's events go to, by the key frontline issued it. */
export const callWebhookUrl = (provider: string, key: string) =>
  `${config.publicUrl}/api/public/webhooks/${provider}/${key}`;

const routeUrl = (url: string, accountId: string) =>
  `${url}/v1/routes/pbx/${encodeURIComponent(accountId)}`;

/** Removes the account's route; one that is already gone counts as removed. */
export const unrouteCalls = async (accountId: string) => {
  const relay = config.pbxRelay;

  if (!relay) return;

  await relayApi
    .delete(routeUrl(relay.url, accountId), {
      headers: { authorization: `Bearer ${relay.key}` },
    })
    .catch((error: unknown) => {
      if (!(error instanceof ProviderRefused) || error.status !== 404) throw error;
    });
};

/**
 * Has pbx-relay forward the UCM's events for the account's trunks and queues to its webhook,
 * signed with its secret, replacing the route it had. A PBX with neither has its route removed,
 * since nothing would route to it. Nothing happens without `PBX_RELAY_URL`. A refusal fails with
 * the relay's reason, such as a trunk another install routes.
 */
export const routeCalls = async (pbx: RoutedPbx, queues: string[], webhookKey: string | null) => {
  const relay = config.pbxRelay;

  if (!relay) return;

  if (!webhookKey) throw new Error('It has no webhook address: connect it again for one');

  const trunks = trunksOf(pbx);

  if (trunks.length === 0 && queues.length === 0) return unrouteCalls(pbx.id);

  await relayApi.put(routeUrl(relay.url, pbx.id), {
    headers: { authorization: `Bearer ${relay.key}` },
    json: {
      ucm: pbx.host,
      url: callWebhookUrl('call', webhookKey),
      secret: pbx.webhookSecret,
      trunks,
      queues,
    },
  });
};
