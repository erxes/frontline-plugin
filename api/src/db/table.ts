import { randomUUID } from 'node:crypto';
import { pgTableCreator, text, timestamp } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { CORE_FILE } from '#/coreFile.ts';

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

/**
 * A file a row keeps, as its column's type and what the API returns: one on core's storage, one a
 * provider hosts (a Messenger photo), or an imported one at its old address.
 */
export const StoredFile = z.object({
  url: z.string().max(2000),
  name: z.string().max(500),
  type: z.string().max(200).optional(),
  size: z.number().int().nonnegative().optional(),
});

export type StoredFile = z.infer<typeof StoredFile>;

/**
 * A file someone attaches, as erxes-ui's Upload reports it: only one on core's storage, so the
 * API never reads or sends anything at an address a caller chose.
 */
export const Attachment = StoredFile.extend({ url: z.string().regex(CORE_FILE) });

export type Attachment = z.infer<typeof Attachment>;

/**
 * A record's Data Extensions values by core field id, as a ticket or conversation keeps them
 * (`dataFields.list` names the fields) and core reads them from the record's view.
 */
export const FieldValues = z.record(z.string(), z.json());

export type FieldValues = z.infer<typeof FieldValues>;

/** Changes to a record's values by field id; null clears one. */
export const FieldValuesPatch = z.record(z.string(), z.json().nullable());
