import { randomUUID } from 'node:crypto';
import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { eq, getTableColumns, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { type Tx, uniqueViolation, withOrg } from '#/db/client.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import {
  BOT_ACCOUNT_INDEX,
  BotMenuItem,
  IceBreaker,
  META_PROVIDERS,
  type MetaProvider,
  metaBots,
} from '#/db/meta.ts';
import { logger } from '#/logger.ts';
import { reads, writes, writesWithCore } from '#/orpc.ts';
import { askMeta, metaAccount } from './metaGraph.ts';
import { clearProfile, pushProfile } from './metaProfile.ts';

const { orgId, ...botColumns } = getTableColumns(metaBots);

/** A bot with the page or account it runs on. */
const Bot = createSelectSchema(metaBots, {
  persistentMenu: z.array(BotMenuItem),
  iceBreakers: z.array(IceBreaker),
})
  .omit({ orgId: true })
  .extend({
    accountName: z.string(),
    provider: z.enum(META_PROVIDERS),
  });

const botRows = (tx: Tx) =>
  tx
    .select({
      ...botColumns,
      accountName: integrationAccounts.name,
      provider: sql<MetaProvider>`${integrationAccounts.provider}`,
    })
    .from(metaBots)
    .innerJoin(integrationAccounts, eq(integrationAccounts.id, metaBots.accountId))
    .$dynamic();

const botById = async (tx: Tx, id: string) => {
  const [bot] = await botRows(tx).where(eq(metaBots.id, id));

  if (!bot) throw new ORPCError('NOT_FOUND', { message: 'No such bot' });

  return bot;
};

const Settings = z.object({
  name: z.string().trim().min(1).max(200),
  persistentMenu: z.array(BotMenuItem).max(20),
  iceBreakers: z.array(IceBreaker).max(4),
  getStartedText: z.string().trim().max(30).nullable(),
  greeting: z.string().trim().max(160).nullable(),
});

/** What a bot Meta took records. */
const synced = { status: 'healthy', error: null, syncedAt: sql`now()` } as const;

/** The bot and its page's token, read in a transaction that ends before Meta is asked. */
const botFor = (member: PluginMember, id: string) =>
  withOrg(member.orgId, async (tx) => {
    const bot = await botById(tx, id);

    return { bot, token: (await metaAccount(tx, bot.accountId)).token };
  });

/** The organisation's bots, by name. */
const list = reads(PERMISSIONS.integrationView)
  .route({ summary: "List your organization's Facebook and Instagram bots by name" })
  .output(z.object({ bots: z.array(Bot) }))
  .handler(async ({ context: { tx } }) => ({
    bots: await botRows(tx).orderBy(metaBots.name, metaBots.id),
  }));

/** One bot. */
const get = reads(PERMISSIONS.integrationView)
  .route({ summary: 'Get one Facebook or Instagram bot' })
  .input(z.object({ id: z.string() }))
  .output(Bot)
  .handler(({ input, context: { tx } }) => botById(tx, input.id));

const taken = () => new ORPCError('CONFLICT', { message: 'This page already has a bot' });

/**
 * Sets up a bot on a page or Instagram account, which has one. Meta takes its profile first,
 * outside the transaction, so Meta's refusal saves nothing.
 */
const create = writesWithCore(
  PERMISSIONS.integrationManage,
  Settings.extend({ accountId: z.string() }),
  async (member, input) => {
    const { provider, token, existing } = await withOrg(member.orgId, async (tx) => ({
      ...(await metaAccount(tx, input.accountId)),
      existing: await tx
        .select({ id: metaBots.id })
        .from(metaBots)
        .where(eq(metaBots.accountId, input.accountId)),
    }));

    if (existing.length) throw taken();

    const id = randomUUID();

    await askMeta(pushProfile(provider, token, { id, ...input }));

    return { id };
  },
)
  .route({
    summary:
      'Set up a bot on a Facebook page or Instagram account; Meta saves its profile first, one bot per page',
  })
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
        if (uniqueViolation(error) === BOT_ACCOUNT_INDEX) throw taken();

        throw error;
      });

    return botById(tx, fromCore.id);
  });

/**
 * Changes the bot's menu, ice breakers, button label or greeting. Meta takes them first, outside
 * the transaction, so Meta's refusal changes nothing.
 */
const update = writesWithCore(
  PERMISSIONS.integrationManage,
  Settings.extend({ id: z.string() }),
  async (member, { id, ...settings }) => {
    const { bot, token } = await botFor(member, id);

    await askMeta(pushProfile(bot.provider, token, { ...bot, ...settings }));
  },
)
  .route({
    summary: "Change a bot's menu, ice breakers, button label or greeting; saved at Meta first",
  })
  .output(Bot)
  .handler(async ({ input: { id, ...settings }, context: { tx } }) => {
    await tx
      .update(metaBots)
      .set({ ...settings, ...synced })
      .where(eq(metaBots.id, id));

    return botById(tx, id);
  });

/** Saves the profile at Meta again, and records whether Meta took it. */
const sync = writesWithCore(
  PERMISSIONS.integrationManage,
  z.object({ id: z.string() }),
  async (member, input) => {
    const { bot, token } = await botFor(member, input.id);

    return pushProfile(bot.provider, token, bot).then(
      () => null,
      (failure: unknown) => (failure instanceof Error ? failure.message : String(failure)),
    );
  },
)
  .route({ summary: "Save a bot's profile at Meta again and mark it healthy or broken" })
  .output(Bot)
  .handler(async ({ input, context: { tx, fromCore: error } }) => {
    await tx
      .update(metaBots)
      .set(error ? { status: 'broken', error, syncedAt: sql`now()` } : synced)
      .where(eq(metaBots.id, input.id));

    return botById(tx, input.id);
  });

/**
 * Removes the bot, then clears its profile at Meta once that commits. A page Meta can't reach
 * doesn't keep the bot: it is removed anyway and logged.
 */
const remove = writes(PERMISSIONS.integrationManage)
  .route({ summary: 'Remove a bot and clear its profile at Meta' })
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }))
  .handler(async ({ input, context: { tx, afterCommit } }) => {
    const bot = await botById(tx, input.id);
    const { token } = await metaAccount(tx, bot.accountId);

    await tx.delete(metaBots).where(eq(metaBots.id, bot.id));

    afterCommit(async () => {
      await clearProfile(bot.provider, token).catch((error: unknown) => {
        logger.warn({ err: error, botId: bot.id }, 'clearing the bot profile failed');
      });
    });

    return { id: bot.id };
  });

export const metaBotProcedures = { list, get, create, update, sync, remove };
