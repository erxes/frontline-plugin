import { ORPCError } from '@orpc/server';
import { eq, getTableColumns, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { type Tx, uniqueViolation } from '#/db/client.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { BOT_ACCOUNT_INDEX, BotMenuItem, IceBreaker, metaBots } from '#/db/meta.ts';
import { logger } from '#/logger.ts';
import { reads, writes } from '#/orpc.ts';
import { askMeta, metaAccount } from './meta.ts';
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
    provider: z.enum(['facebook', 'instagram']),
  });

const botRows = (tx: Tx) =>
  tx
    .select({
      ...botColumns,
      accountName: integrationAccounts.name,
      provider: sql<'facebook' | 'instagram'>`${integrationAccounts.provider}`,
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

/** Saves the bot's profile at Meta, then marks it synced; Meta's refusal undoes the change. */
const pushed = async (tx: Tx, id: string) => {
  const bot = await botById(tx, id);
  const { token } = await metaAccount(tx, bot.accountId);

  await askMeta(pushProfile(bot.provider, token, bot));
  await tx
    .update(metaBots)
    .set({ status: 'healthy', error: null, syncedAt: sql`now()` })
    .where(eq(metaBots.id, id));

  return botById(tx, id);
};

/** The organisation's bots, by name. */
const list = reads(PERMISSIONS.integrationView)
  .output(z.object({ bots: z.array(Bot) }))
  .handler(async ({ context: { tx } }) => ({
    bots: await botRows(tx).orderBy(metaBots.name, metaBots.id),
  }));

/** One bot. */
const get = reads(PERMISSIONS.integrationView)
  .input(z.object({ id: z.string() }))
  .output(Bot)
  .handler(({ input, context: { tx } }) => botById(tx, input.id));

/** Sets up a bot on a page or Instagram account, which has one. */
const create = writes(PERMISSIONS.integrationManage)
  .input(Settings.extend({ accountId: z.string() }))
  .output(Bot)
  .handler(async ({ input, context: { tx, member } }) => {
    await metaAccount(tx, input.accountId);

    const [created] = await tx
      .insert(metaBots)
      .values({ ...input, orgId: member.orgId, createdBy: member.userId })
      .returning({ id: metaBots.id })
      .catch((error: unknown) => {
        if (uniqueViolation(error) === BOT_ACCOUNT_INDEX)
          throw new ORPCError('CONFLICT', { message: 'This page already has a bot' });

        throw error;
      });

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return pushed(tx, created.id);
  });

/** Changes the bot's menu, ice breakers, button label or greeting, and saves them at Meta. */
const update = writes(PERMISSIONS.integrationManage)
  .input(Settings.extend({ id: z.string() }))
  .output(Bot)
  .handler(async ({ input: { id, ...settings }, context: { tx } }) => {
    await botById(tx, id);
    await tx.update(metaBots).set(settings).where(eq(metaBots.id, id));

    return pushed(tx, id);
  });

/** Saves the profile at Meta again, and records whether Meta took it. */
const sync = writes(PERMISSIONS.integrationManage)
  .input(z.object({ id: z.string() }))
  .output(Bot)
  .handler(async ({ input, context: { tx } }) => {
    const bot = await botById(tx, input.id);
    const { token } = await metaAccount(tx, bot.accountId);

    const error = await pushProfile(bot.provider, token, bot).then(
      () => null,
      (failure: unknown) => (failure instanceof Error ? failure.message : String(failure)),
    );

    await tx
      .update(metaBots)
      .set({ status: error ? 'broken' : 'healthy', error, syncedAt: sql`now()` })
      .where(eq(metaBots.id, bot.id));

    return botById(tx, bot.id);
  });

/**
 * Removes the bot and clears its profile at Meta. A page Meta can't reach doesn't keep the bot:
 * it is removed anyway and logged.
 */
const remove = writes(PERMISSIONS.integrationManage)
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }))
  .handler(async ({ input, context: { tx } }) => {
    const bot = await botById(tx, input.id);
    const { token } = await metaAccount(tx, bot.accountId);

    await clearProfile(bot.provider, token).catch((error: unknown) => {
      logger.warn({ err: error, botId: bot.id }, 'clearing the bot profile failed');
    });
    await tx.delete(metaBots).where(eq(metaBots.id, bot.id));

    return { id: bot.id };
  });

export const metaBotProcedures = { list, get, create, update, sync, remove };
