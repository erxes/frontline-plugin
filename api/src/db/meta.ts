import { sql } from 'drizzle-orm';
import { check, foreignKey, jsonb, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { integrationAccounts } from './integrations.ts';
import { id, stamps, table } from './table.ts';

/** A persistent menu item: a button that comes back as the customer's message, or a link. */
export const BotMenuItem = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal('postback'),
    title: z.string().trim().min(1).max(30),
  }),
  z.object({
    id: z.string().min(1).max(64),
    type: z.literal('link'),
    title: z.string().trim().min(1).max(30),
    url: z.url(),
  }),
]);

/** A question Messenger and Instagram offer a customer before their first message. */
export const IceBreaker = z.object({
  id: z.string().min(1).max(64),
  question: z.string().trim().min(1).max(80),
});

export const BOT_STATUSES = ['healthy', 'broken'] as const;

/** A page or Instagram account has one bot. A second fails with 23505. */
export const BOT_ACCOUNT_INDEX = 'frontline_meta_bots_org_account_key';

/**
 * The Messenger or Instagram profile frontline sets on a connected page or account: its persistent
 * menu, ice breakers, Get Started button and greeting. A tap comes back as a postback message
 * whose payload names the bot and the item. Removing the account removes its bot.
 */
export const metaBots = table(
  'meta_bots',
  {
    id: id(),
    orgId: text().notNull(),
    accountId: text().notNull(),
    name: text().notNull(),
    persistentMenu: jsonb().$type<z.infer<typeof BotMenuItem>[]>().notNull().default([]),
    iceBreakers: jsonb().$type<z.infer<typeof IceBreaker>[]>().notNull().default([]),
    /** The Get Started button's label; Messenger only. */
    getStartedText: text(),
    /** The text a customer sees before they write; Messenger only. */
    greeting: text(),
    status: text({ enum: BOT_STATUSES }).notNull().default('healthy'),
    /** Why Meta last refused the profile. */
    error: text(),
    syncedAt: timestamp({ withTimezone: true }),
    ...stamps(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_meta_bots_account_fkey',
      columns: [t.orgId, t.accountId],
      foreignColumns: [integrationAccounts.orgId, integrationAccounts.id],
    }).onDelete('cascade'),
    unique(BOT_ACCOUNT_INDEX).on(t.orgId, t.accountId),
    check('frontline_meta_bots_status_check', sql`${t.status} in ('healthy', 'broken')`),
  ],
);
