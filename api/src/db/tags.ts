import { sql } from 'drizzle-orm';
import { check, text, uniqueIndex } from 'drizzle-orm/pg-core';
import { id, stamps, table } from './table.ts';

/** What a tag labels: core's tags are for customers and companies, so the plugin keeps its own. */
export const TAG_TYPES = ['ticket', 'conversation'] as const;

/** Names are unique per type, ignoring case; a write that breaks one fails with 23505. */
export const TAG_NAME_INDEX = 'frontline_tags_org_type_name_key';

/** A label members put on tickets or conversations, which lists filter by. */
export const tags = table(
  'tags',
  {
    id: id(),
    orgId: text().notNull(),
    type: text({ enum: TAG_TYPES }).notNull(),
    name: text().notNull(),
    /** A hex colour, from erxes-ui's ColorPicker. */
    colorCode: text(),
    ...stamps(),
  },
  (t) => [
    uniqueIndex(TAG_NAME_INDEX).on(t.orgId, t.type, sql`lower(${t.name})`),
    check('frontline_tags_type_check', sql`${t.type} in ('ticket', 'conversation')`),
  ],
);
