import { randomBytes } from 'node:crypto';
import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, eq, or, sql } from 'drizzle-orm';
import type { Tx } from '#/db/client.ts';
import { integrations } from '#/db/inbox.ts';
import { publicKeys } from '#/db/public.ts';
import { channels } from '#/db/schema.ts';

/** What a public key opens when it names an integration. */
export const INTEGRATION_KEY = 'integration';

/**
 * Inserts an integration with the key its embed or webhook carries, once the caller checked its
 * channel and its kind's config.
 */
export const insertIntegration = async (
  tx: Tx,
  by: Pick<PluginMember, 'orgId' | 'userId'>,
  input: { channelId: string; kind: string; name: string; config: Record<string, unknown> },
) => {
  const [created] = await tx
    .insert(integrations)
    .values({ ...input, orgId: by.orgId, createdBy: by.userId })
    .returning({ id: integrations.id });

  if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

  await tx.insert(publicKeys).values({
    key: randomBytes(32).toString('base64url'),
    orgOf: by.orgId,
    kind: INTEGRATION_KEY,
    targetId: created.id,
  });

  return created;
};

/**
 * The channel `accountId` already takes conversations into, as an active integration, or as
 * any integration of `channelId`. An account serves one channel: the inbox routes what it
 * receives to its oldest active integration, so a second one would stay silent.
 */
export const channelServing = async (tx: Tx, accountId: string, channelId?: string) => {
  const [serving] = await tx
    .select({ id: channels.id, name: channels.name })
    .from(integrations)
    .innerJoin(channels, eq(channels.id, integrations.channelId))
    .where(
      and(
        sql`${integrations.config} ->> 'accountId' = ${accountId}`,
        or(
          eq(integrations.isActive, true),
          channelId ? eq(integrations.channelId, channelId) : undefined,
        ),
      ),
    )
    .limit(1);

  return serving;
};
