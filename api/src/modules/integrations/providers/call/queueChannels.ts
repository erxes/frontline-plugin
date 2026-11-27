import type { PluginMember } from '@erxes/plugin-sdk';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '#/db/client.ts';
import { integrations } from '#/db/inbox.ts';
import { channelFor } from '../../../channels/access.ts';
import { insertIntegration } from '../../../inbox/insertIntegration.ts';
import { inOrder } from '../../provider.ts';

/** A phone integration names its account and the queues whose calls come to its channel. */
export const CallIntegrationConfig = z.object({
  accountId: z.string().min(1),
  queues: z.array(z.string()).default([]),
});

const queuesIn = (config: unknown) => CallIntegrationConfig.safeParse(config).data?.queues ?? [];

/** The account's integrations, oldest first, each with the queues it names. */
export const accountIntegrations = async (tx: Tx, accountId: string, onlyActive = false) =>
  (
    await tx
      .select({
        id: integrations.id,
        channelId: integrations.channelId,
        isActive: integrations.isActive,
        config: integrations.config,
      })
      .from(integrations)
      .where(
        and(
          sql`${integrations.config} ->> 'accountId' = ${accountId}`,
          onlyActive ? eq(integrations.isActive, true) : undefined,
        ),
      )
      .orderBy(asc(integrations.createdAt), asc(integrations.id))
  ).map((row) => ({ ...row, queues: queuesIn(row.config) }));

type Found = Awaited<ReturnType<typeof accountIntegrations>>[number];

/** The account's own integration: its oldest naming no queue, which takes every other call. */
const ownIntegration = (found: Found[]) =>
  found.find((integration) => integration.queues.length === 0) ?? found[0];

/** The integration a call through `queue` goes to: the one naming it, else the account's own. */
export const integrationForQueue = (found: Found[], queue: string | null) =>
  (queue ? found.find((integration) => integration.queues.includes(queue)) : undefined) ??
  ownIntegration(found);

/** Each queue's channel, for a queue whose calls go to another channel than the account's own. */
export const queueChannelsOf = async (tx: Tx, accountId: string) => {
  const found = await accountIntegrations(tx, accountId, true);

  return new Map(
    found.flatMap((integration) =>
      integration.queues.map((queue) => [queue, integration.channelId]),
    ),
  );
};

/**
 * Sends each queue's calls to its channel: the account gets an integration in each channel a
 * queue names, listing that channel's queues, and one no queue names any more is archived with
 * its conversations kept. A queue in the account's own channel, or in none, stays with it.
 */
export const saveQueueChannels = async (
  tx: Tx,
  member: PluginMember,
  account: { id: string; provider: string; name: string },
  queues: { queue: string; channelId?: string | null }[],
) => {
  const found = await accountIntegrations(tx, account.id);
  const own = ownIntegration(found);
  const wanted = new Map<string, string[]>();

  for (const { queue, channelId } of queues)
    if (channelId && channelId !== own?.channelId)
      wanted.set(channelId, [...(wanted.get(channelId) ?? []), queue]);

  await inOrder([...wanted], async ([channelId, named]) => {
    await channelFor(tx, member, channelId, { change: true });

    const kept = found.find(
      (integration) => integration !== own && integration.channelId === channelId,
    );

    const config = { accountId: account.id, queues: named };

    if (kept)
      await tx
        .update(integrations)
        .set({ config, isActive: true })
        .where(eq(integrations.id, kept.id));
    else
      await insertIntegration(tx, member, {
        channelId,
        kind: account.provider,
        name: account.name,
        config,
      });
  });

  const dropped = found
    .filter(
      (integration) =>
        integration !== own && integration.queues.length > 0 && !wanted.has(integration.channelId),
    )
    .map((integration) => integration.id);

  if (dropped.length)
    await tx
      .update(integrations)
      .set({ config: { accountId: account.id, queues: [] }, isActive: false })
      .where(inArray(integrations.id, dropped));
};
