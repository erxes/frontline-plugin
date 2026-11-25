import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { tickets } from '#/db/tickets.ts';
import { writes } from '#/orpc.ts';
import { changeEvents, publish, snapshot } from './events.ts';
import { signalTickets, Ticket, ticketById, ticketsFor } from './shared.ts';

/**
 * Adds the caller to the ticket's followers or takes them off, in SQL, so two members following
 * at once both stay. Anyone who sees the ticket may, as in the old app; its status's edit list
 * doesn't apply.
 */
const follow = writes(PERMISSIONS.channelView)
  .route({ summary: 'Follow or unfollow a ticket, to hear or stop hearing of its changes' })
  .input(z.object({ id: z.string(), following: z.boolean() }))
  .output(Ticket)
  .handler(async ({ input: { id, following }, context: { tx, member } }) => {
    await ticketsFor(tx, member, [id]);
    const before = await snapshot(tx, [id]);
    const others = sql`array_remove(${tickets.subscribedUserIds}, ${member.userId})`;

    await tx
      .update(tickets)
      .set({
        subscribedUserIds: following ? sql`array_append(${others}, ${member.userId})` : others,
      })
      .where(eq(tickets.id, id));

    await publish(tx, member, changeEvents(before, await snapshot(tx, [id])));
    // Who follows a ticket is the team's: its screens refetch, the customer's tab has nothing new.
    await signalTickets(tx, member, []);

    return ticketById(tx, member, id);
  });

export const followProcedures = { follow };
