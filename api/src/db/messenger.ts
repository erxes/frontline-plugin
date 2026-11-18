import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { integrations } from './inbox.ts';
import { id, stamps, table } from './table.ts';

/**
 * The key a website signs its visitors' email, phone or user id with, one per messenger. A
 * visitor becomes an existing customer only with that signature. Sealed by `sealSecret`
 * (`modules/integrations/secrets.ts`); deleting the messenger deletes it.
 */
export const messengerSecrets = table(
  'messenger_secrets',
  {
    id: id(),
    orgId: text().notNull(),
    integrationId: text().notNull(),
    secret: text().notNull(),
    ...stamps(),
  },
  (t) => [
    unique('frontline_messenger_secrets_org_integration_key').on(t.orgId, t.integrationId),
    foreignKey({
      name: 'frontline_messenger_secrets_integration_fkey',
      columns: [t.orgId, t.integrationId],
      foreignColumns: [integrations.orgId, integrations.id],
    }).onDelete('cascade'),
  ],
);

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
