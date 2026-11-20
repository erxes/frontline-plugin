import { sql } from 'drizzle-orm';
import { check, jsonb, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { z } from 'zod';
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
export const BOT_CONNECTION_INDEX = 'frontline_meta_bots_org_connection_key';

/**
 * The Messenger or Instagram profile frontline sets on one of core's Meta connections: its
 * persistent menu, ice breakers, Get Started button and greeting. A tap comes back as a postback
 * message whose payload names the bot and the item.
 */
export const metaBots = table(
  'meta_bots',
  {
    id: id(),
    orgId: text().notNull(),
    connectionId: text().notNull(),
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
    unique(BOT_CONNECTION_INDEX).on(t.orgId, t.connectionId),
    check('frontline_meta_bots_status_check', sql`${t.status} in ('healthy', 'broken')`),
  ],
);

export const metaApps = table(
  'meta_apps',
  {
    id: id(),
    orgId: text().notNull(),
    appId: text().notNull(),
    /** `{ appSecret }`, sealed by `sealSecret`. */
    secret: text().notNull(),
    verifyToken: text().notNull(),
    ...stamps(),
  },
  (t) => [unique('frontline_meta_apps_org_key').on(t.orgId)],
);

export const META_KINDS = ['facebook', 'instagram'] as const;

export const metaAccounts = table(
  'meta_accounts',
  {
    id: text().primaryKey(),
    orgId: text().notNull(),
    kind: text({ enum: META_KINDS }).notNull(),
    externalId: text().notNull(),
    name: text().notNull(),
    config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    secret: text().notNull(),
    status: text().notNull(),
    error: text(),
    ...stamps(),
  },
  (t) => [
    unique('frontline_meta_accounts_org_kind_external_key').on(t.orgId, t.kind, t.externalId),
    check('frontline_meta_accounts_kind_check', sql`${t.kind} in ('facebook', 'instagram')`),
  ],
);
