import { randomUUID } from 'node:crypto';
import { pgTableCreator, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Every table is `frontline_<name>`: the plugin shares core's database, and core
 * gives its role rights on its own tables only. Name indexes and constraints
 * in full (`frontline_channel_members_org_user_idx`).
 */
export const table = pgTableCreator((name) => `frontline_${name}`);

/** A text id: a random UUID, or the Mongo `_id` an imported row keeps. */
export const id = () =>
  text()
    .primaryKey()
    .$defaultFn(() => randomUUID());

/** Who made the row and when, and when it last changed. */
export const stamps = () => ({
  createdBy: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** A file on core's storage, as erxes-ui's Upload reports it. */
export type Attachment = { url: string; name: string; type?: string; size?: number };
