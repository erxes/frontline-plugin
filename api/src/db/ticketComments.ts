import { foreignKey, index, text, timestamp } from 'drizzle-orm/pg-core';
import { id, table } from './table.ts';
import { tickets } from './tickets.ts';

/**
 * What a member writes on a ticket for its customer, who reads it with the ticket in the
 * messenger. The team's own notes stay in core's Activity tab, which customers never see.
 */
export const ticketComments = table(
  'ticket_comments',
  {
    id: id(),
    orgId: text().notNull(),
    ticketId: text().notNull(),
    body: text().notNull(),
    /** The core user who wrote it. */
    createdBy: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: 'frontline_ticket_comments_ticket_fkey',
      columns: [t.ticketId],
      foreignColumns: [tickets.id],
    }).onDelete('cascade'),
    index('frontline_ticket_comments_org_ticket_created_idx').on(t.orgId, t.ticketId, t.createdAt),
  ],
);
