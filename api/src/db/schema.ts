import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { table } from './table.ts';

/** Names are unique per organisation, ignoring case. A write that breaks it fails with 23505. */
export const CHANNEL_NAME_INDEX = 'frontline_channels_org_name_key';

/**
 * A team inbox: conversations arrive in a channel, and its members work them.
 * `org_id` is the core organisation; row-level security (`core_enable_tenant_rls`
 * in the migration) shows each transaction only its organisation's rows. Ids are
 * text, so imported Mongo `_id`s fit.
 */
export const channels = table(
  'channels',
  {
    id: text()
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    orgId: text().notNull(),
    name: text().notNull(),
    description: text().notNull().default(''),
    createdBy: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex(CHANNEL_NAME_INDEX).on(t.orgId, sql`lower(${t.name})`),
    uniqueIndex('frontline_channels_org_id_key').on(t.orgId, t.id),
  ],
);

export const CHANNEL_ROLES = ['admin', 'member'] as const;

/** Who works a channel. An admin changes the channel and its members; every channel keeps one. */
export const channelMembers = table(
  'channel_members',
  {
    orgId: text().notNull(),
    channelId: text().notNull(),
    /** A core user id. */
    userId: text().notNull(),
    role: text({ enum: CHANNEL_ROLES }).notNull().default('member'),
    createdBy: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: 'frontline_channel_members_pkey',
      columns: [t.orgId, t.channelId, t.userId],
    }),
    foreignKey({
      name: 'frontline_channel_members_channel_fkey',
      columns: [t.orgId, t.channelId],
      foreignColumns: [channels.orgId, channels.id],
    }).onDelete('cascade'),
    index('frontline_channel_members_org_user_idx').on(t.orgId, t.userId),
    check('frontline_channel_members_role_check', sql`${t.role} in ('admin', 'member')`),
  ],
);
