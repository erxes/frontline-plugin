import { boolean, index, integer, jsonb, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { table } from './table.ts';

/** What a visitor's browser tells the messenger about the page it opened on. */
export const BrowserInfo = z.object({
  url: z.string().max(2000).optional(),
  hostname: z.string().max(500).optional(),
  language: z.string().max(50).optional(),
  userAgent: z.string().max(1000).optional(),
});

export type BrowserInfo = z.infer<typeof BrowserInfo>;

/**
 * A messenger visitor's sessions: whether a messenger of theirs is open now, when they were last
 * seen, how many times they came, and the page and browser of the latest visit. The old plugin
 * kept these on core's customers; they describe the plugin's widget, so the plugin keeps them.
 */
export const visitors = table(
  'visitors',
  {
    orgId: text().notNull(),
    /** A core customer id. */
    customerId: text().notNull(),
    /** The messenger they last opened. */
    integrationId: text().notNull(),
    isOnline: boolean().notNull().default(false),
    sessionCount: integer().notNull().default(0),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    browser: jsonb().$type<BrowserInfo>().notNull().default({}),
    /** The address the latest visit came from. */
    remoteAddress: text(),
  },
  (t) => [
    primaryKey({ name: 'frontline_visitors_pkey', columns: [t.orgId, t.customerId] }),
    index('frontline_visitors_org_integration_idx').on(t.orgId, t.integrationId),
  ],
);
