import { randomUUID } from 'node:crypto';

import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { eq, getTableColumns, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { type Tx, uniqueViolation, withOrg } from '#/db/client.ts';
import { BOT_CONNECTION_INDEX, BotMenuItem, IceBreaker, META_KINDS, metaBots } from '#/db/meta.ts';
import { logger } from '#/logger.ts';
import { readsWithCore, writes, writesWithCore } from '#/orpc.ts';
import { type Connection, connectionOf, connectionsOf } from './meta.ts';
import { clearProfile, pushProfile } from './metaProfile.ts';

const { orgId, ...botColumns } = getTableColumns(metaBots);

const Bot = createSelectSchema(metaBots, {
  persistentMenu: z.array(BotMenuItem),
  iceBreakers: z.array(IceBreaker),
})
  .omit({ orgId: true })
  .extend({ connectionName: z.string(), kind: z.enum(META_KINDS) });

type BotRow = Omit<typeof metaBots.$inferSelect, 'orgId'>;

const shown = (bot: BotRow, connection: Connection) => ({
  ...bot,
  connectionName: connection.name,
  kind: connection.kind,
});

const botRow = async (tx: Tx, id: string) => {
  const [bot] = await tx.select(botColumns).from(metaBots).where(eq(metaBots.id, id));

  if (!bot) throw new ORPCError('NOT_FOUND', { message: 'No such bot' });

  return bot;
};

const shownWith = (bot: BotRow, connections: Connection[]) => {
  const connection = connections.find((one) => one.id === bot.connectionId);

  if (!connection) throw new ORPCError('NOT_FOUND', { message: "The bot's page is disconnected" });

  return shown(bot, connection);
};

const Settings = z.object({
  name: z.string().trim().min(1).max(200),
  persistentMenu: z.array(BotMenuItem).max(20),
  iceBreakers: z.array(IceBreaker).max(4),
  getStartedText: z.string().trim().max(30).nullable(),
  greeting: z.string().trim().max(160).nullable(),
});

const synced = { status: 'healthy', error: null, syncedAt: sql`now()` } as const;

const botFor = async (member: PluginMember, id: string) => {
  const bot = await withOrg(member.orgId, (tx) => botRow(tx, id));
  const connection = await connectionOf(member.orgId, bot.connectionId);

  return { bot, connection, target: { orgId: member.orgId, ...connection } };
};

const list = readsWithCore(PERMISSIONS.integrationView, z.object({}).optional(), (member) =>
  connectionsOf(member.orgId),
)
  .output(z.object({ bots: z.array(Bot) }))
  .handler(async ({ context: { tx, fromCore } }) => {
    const bots = await tx.select(botColumns).from(metaBots).orderBy(metaBots.name, metaBots.id);

    return {
      bots: bots.flatMap((bot) => {
        const connection = fromCore.find((one) => one.id === bot.connectionId);

        return connection ? [shown(bot, connection)] : [];
      }),
    };
  });

const get = readsWithCore(PERMISSIONS.integrationView, z.object({ id: z.string() }), (member) =>
  connectionsOf(member.orgId),
)
  .output(Bot)
  .handler(async ({ input, context: { tx, fromCore } }) =>
    shownWith(await botRow(tx, input.id), fromCore),
  );

const taken = () => new ORPCError('CONFLICT', { message: 'This page already has a bot' });

const create = writesWithCore(
  PERMISSIONS.integrationManage,
  Settings.extend({ connectionId: z.string() }),
  async (member, input) => {
    const connection = await connectionOf(member.orgId, input.connectionId);

    const existing = await withOrg(member.orgId, (tx) =>
      tx
        .select({ id: metaBots.id })
        .from(metaBots)
        .where(eq(metaBots.connectionId, input.connectionId)),
    );

    if (existing.length) throw taken();

    const id = randomUUID();

    await pushProfile({ orgId: member.orgId, ...connection }, { id, ...input });

    return { id, connection };
  },
)
  .output(Bot)
  .handler(async ({ input, context: { tx, member, fromCore } }) => {
    await tx
      .insert(metaBots)
      .values({
        ...input,
        ...synced,
        id: fromCore.id,
        orgId: member.orgId,
        createdBy: member.userId,
      })
      .catch((error: unknown) => {
        if (uniqueViolation(error) === BOT_CONNECTION_INDEX) throw taken();

        throw error;
      });

    return shown(await botRow(tx, fromCore.id), fromCore.connection);
  });

const update = writesWithCore(
  PERMISSIONS.integrationManage,
  Settings.extend({ id: z.string() }),
  async (member, { id, ...settings }) => {
    const { bot, connection, target } = await botFor(member, id);

    await pushProfile(target, { ...bot, ...settings });

    return connection;
  },
)
  .output(Bot)
  .handler(async ({ input: { id, ...settings }, context: { tx, fromCore } }) => {
    await tx
      .update(metaBots)
      .set({ ...settings, ...synced })
      .where(eq(metaBots.id, id));

    return shown(await botRow(tx, id), fromCore);
  });

const sync = writesWithCore(
  PERMISSIONS.integrationManage,
  z.object({ id: z.string() }),
  async (member, input) => {
    const { bot, connection, target } = await botFor(member, input.id);

    const error = await pushProfile(target, bot).then(
      () => null,
      (failure: unknown) => (failure instanceof Error ? failure.message : String(failure)),
    );

    return { connection, error };
  },
)
  .output(Bot)
  .handler(async ({ input, context: { tx, fromCore } }) => {
    await tx
      .update(metaBots)
      .set(
        fromCore.error ? { status: 'broken', error: fromCore.error, syncedAt: sql`now()` } : synced,
      )
      .where(eq(metaBots.id, input.id));

    return shown(await botRow(tx, input.id), fromCore.connection);
  });

const remove = writes(PERMISSIONS.integrationManage)
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }))
  .handler(async ({ input, context: { tx, member, afterCommit } }) => {
    const bot = await botRow(tx, input.id);

    await tx.delete(metaBots).where(eq(metaBots.id, bot.id));

    afterCommit(async () => {
      await connectionOf(member.orgId, bot.connectionId)
        .then((connection) => clearProfile({ orgId: member.orgId, ...connection }))
        .catch((error: unknown) => {
          logger.warn({ err: error, botId: bot.id }, 'clearing the bot profile failed');
        });
    });

    return { id: bot.id };
  });

export const metaBotProcedures = { list, get, create, update, sync, remove };
