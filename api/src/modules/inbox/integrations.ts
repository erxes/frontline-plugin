import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, eq, getTableColumns } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { integrations } from '#/db/inbox.ts';
import { publicKeys } from '#/db/public.ts';
import { channelMembers } from '#/db/schema.ts';
import { reads, writes } from '#/orpc.ts';
import { canChangeSql, channelFor, membership, seenBy } from '../channels/access.ts';
import { Title } from '../fields.ts';
import { integrationChanges } from '../messenger/adapter.ts';
import { removeKeys } from '../public.ts';
import { channelServing, INTEGRATION_KEY, insertIntegration } from './insertIntegration.ts';
import { ADAPTERS } from './adapters.ts';

/** The row without `org_id`, which the caller already knows. */
const { orgId, ...integrationColumns } = getTableColumns(integrations);

/** The row, the key its embed or webhook carries, and whether the caller may change it. */
const Integration = createSelectSchema(integrations, {
  config: () => z.record(z.string(), z.unknown()),
})
  .omit({ orgId: true })
  .extend({ publicKey: z.string(), canManage: z.boolean() });

const integrationRows = (tx: Tx, member: PluginMember) =>
  tx
    .select({ ...integrationColumns, publicKey: publicKeys.key, canManage: canChangeSql(member) })
    .from(integrations)
    .innerJoin(
      publicKeys,
      and(eq(publicKeys.kind, INTEGRATION_KEY), eq(publicKeys.targetId, integrations.id)),
    )
    .leftJoin(channelMembers, membership(member, integrations.channelId))
    .$dynamic();

export const integrationById = async (tx: Tx, member: PluginMember, id: string) => {
  const [row] = await integrationRows(tx, member).where(
    and(eq(integrations.id, id), seenBy(member, integrations.channelId)),
  );

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such integration' });

  return row;
};

/** The adapter's reading of `config`, or BAD_REQUEST naming what it refused. */
const configOf = (kind: string, config: Record<string, unknown>) => {
  const adapter = ADAPTERS.get(kind);

  if (!adapter) throw new ORPCError('BAD_REQUEST', { message: `No ${kind} integrations` });

  const parsed = adapter.config.safeParse(config);

  if (!parsed.success)
    throw new ORPCError('BAD_REQUEST', { message: z.prettifyError(parsed.error) });

  return parsed.data;
};

/** The integrations of the caller's channels, or of one channel, oldest first. */
const list = reads(PERMISSIONS.channelView)
  .input(z.object({ channelId: z.string().optional() }))
  .output(z.array(Integration))
  .handler(({ input, context: { tx, member } }) =>
    integrationRows(tx, member)
      .where(
        and(
          seenBy(member, integrations.channelId),
          input.channelId ? eq(integrations.channelId, input.channelId) : undefined,
        ),
      )
      .orderBy(asc(integrations.createdAt), asc(integrations.id)),
  );

const get = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Integration)
  .handler(({ input, context: { tx, member } }) => integrationById(tx, member, input.id));

/** The config of an integration that takes conversations through a connected account. */
const ThroughAccount = z.object({ accountId: z.string() });

/**
 * A new integration of a channel the caller is an admin of, with the key its embed or webhook
 * carries. `config` is checked by the kind's adapter. An account that serves a channel already
 * is refused (`channelServing`).
 */
const create = writes(PERMISSIONS.channelView)
  .input(
    z.object({
      channelId: z.string(),
      kind: z.string(),
      name: Title,
      config: z.record(z.string(), z.unknown()).default({}),
    }),
  )
  .output(Integration)
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.channelId, { change: true });

    const config = configOf(input.kind, input.config);
    const account = ThroughAccount.safeParse(config).data;
    const serving = account && (await channelServing(tx, account.accountId, input.channelId));

    if (serving)
      throw new ORPCError('CONFLICT', {
        message: `This account takes conversations into ${serving.name} already`,
      });

    const created = await insertIntegration(tx, member, { ...input, config });

    return integrationById(tx, member, created.id);
  });

/** The integration `id` a channel admin may change, locked. */
export const integrationFor = async (tx: Tx, member: PluginMember, id: string) => {
  const [row] = await tx
    .select({ channelId: integrations.channelId, kind: integrations.kind })
    .from(integrations)
    .where(eq(integrations.id, id))
    .for('update');

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such integration' });

  await channelFor(tx, member, row.channelId, { change: true });

  return row;
};

/**
 * Renames, pauses or reconfigures an integration, or moves it with its conversations to another
 * channel the caller is an admin of. A paused one takes no new messages.
 */
const update = writes(PERMISSIONS.channelView)
  .input(
    z.object({
      id: z.string(),
      name: Title.optional(),
      isActive: z.boolean().optional(),
      config: z.record(z.string(), z.unknown()).optional(),
      channelId: z.string().optional(),
    }),
  )
  .output(Integration)
  .handler(async ({ input: { id, config, ...change }, context: { tx, member, afterCommit } }) => {
    const row = await integrationFor(tx, member, id);

    if (change.channelId && change.channelId !== row.channelId)
      await channelFor(tx, member, change.channelId, { change: true });

    // Its conversations follow it: their key to it cascades on update.
    await tx
      .update(integrations)
      .set({ ...change, ...(config ? { config: configOf(row.kind, config) } : {}) })
      .where(eq(integrations.id, id));

    afterCommit(async () => {
      integrationChanges.emit('changed', id);
    });

    return integrationById(tx, member, id);
  });

/** Deletes an integration, its conversations and its key. */
const remove = writes(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }))
  .handler(async ({ input, context: { tx, member, afterCommit } }) => {
    await integrationFor(tx, member, input.id);
    await tx.delete(integrations).where(eq(integrations.id, input.id));
    afterCommit(async () => {
      integrationChanges.emit('changed', input.id);
    });
    await removeKeys(
      tx,
      member.orgId,
      and(eq(publicKeys.kind, INTEGRATION_KEY), eq(publicKeys.targetId, input.id)),
    );

    return { id: input.id };
  });

export const integrationProcedures = { list, get, create, update, remove };
