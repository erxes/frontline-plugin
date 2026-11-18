import { randomBytes } from 'node:crypto';
import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import type { Tx } from '#/db/client.ts';
import { integrations } from '#/db/inbox.ts';
import { publicKeys } from '#/db/public.ts';

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
