import { sql } from 'drizzle-orm';
import { check, jsonb, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { id, stamps, table } from './table.ts';

/**
 * Where conversations come from besides the messenger. Each provider's code lives in
 * `api/src/modules/integrations/providers`, and shared code never names one.
 */
export const PROVIDERS = ['telegram', 'discord', 'mail', 'call', 'callpro'] as const;

export const ACCOUNT_STATUSES = ['healthy', 'broken'] as const;

/** One account is connected once per organisation. A second connect fails with 23505. */
export const ACCOUNT_EXTERNAL_INDEX = 'frontline_integration_accounts_org_provider_external_key';

/**
 * Something an organisation connected at a provider: a Telegram or Discord bot, a mailbox, a phone
 * line. Facebook pages and Instagram accounts are core's Meta connections. It keeps only the provider's id for it, its settings and
 * its secrets; conversations, messages and customers are the inbox's.
 */
export const integrationAccounts = table(
  'integration_accounts',
  {
    id: id(),
    orgId: text().notNull(),
    provider: text({ enum: PROVIDERS }).notNull(),
    /** The provider's id: a bot's user id, the mail address, a phone line's. */
    externalId: text().notNull(),
    name: text().notNull(),
    /** Settings without secrets, as the provider's `Config` schema reads them. */
    config: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    /** Tokens and passwords, sealed by `sealSecret` (`modules/integrations/secrets.ts`). */
    secret: text().notNull(),
    /** Where a pull left off, such as the last mail uid seen. */
    syncState: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    status: text({ enum: ACCOUNT_STATUSES }).notNull().default('healthy'),
    /** Why the provider last refused the account. */
    error: text(),
    checkedAt: timestamp({ withTimezone: true }),
    ...stamps(),
  },
  (t) => [
    unique(ACCOUNT_EXTERNAL_INDEX).on(t.orgId, t.provider, t.externalId),
    unique('frontline_integration_accounts_org_id_key').on(t.orgId, t.id),
    check(
      'frontline_integration_accounts_provider_check',
      sql`${t.provider} in ('telegram', 'discord', 'mail', 'call', 'callpro')`,
    ),
    check('frontline_integration_accounts_status_check', sql`${t.status} in ('healthy', 'broken')`),
  ],
);
