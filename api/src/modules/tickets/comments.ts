import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { ticketComments } from '#/db/ticketComments.ts';
import { tickets } from '#/db/tickets.ts';
import { reads, writes } from '#/orpc.ts';
import { seenTicket, signalTickets, ticketsFor } from './shared.ts';

/** The row without `org_id`, which the caller already knows. */
const { orgId, ...commentColumns } = getTableColumns(ticketComments);

/** The row, with whether the caller wrote it and may take it back, which the query selects. */
const Comment = createSelectSchema(ticketComments)
  .omit({ orgId: true })
  .extend({ mine: z.boolean() });

/**
 * The ticket the caller may change, as `signalTickets` takes it, so the customer's tab refetches.
 * NOT_FOUND when they don't see it.
 */
const changeable = async (tx: Tx, member: PluginMember, ticketId: string) => {
  await ticketsFor(tx, member, [ticketId]);

  return tx
    .select({ id: tickets.id, customerId: tickets.customerId })
    .from(tickets)
    .where(eq(tickets.id, ticketId));
};

/** The comments for the ticket's customer, oldest first. NOT_FOUND when the caller doesn't see it. */
const comments = reads(PERMISSIONS.channelView)
  .input(z.object({ ticketId: z.string() }))
  .output(z.array(Comment))
  .handler(async ({ input: { ticketId }, context: { tx, member } }) => {
    await seenTicket(tx, member, ticketId);

    return tx
      .select({
        ...commentColumns,
        mine: sql<boolean>`${ticketComments.createdBy} = ${member.userId}`,
      })
      .from(ticketComments)
      .where(eq(ticketComments.ticketId, ticketId))
      .orderBy(asc(ticketComments.createdAt), asc(ticketComments.id));
  });

/**
 * Writes to the ticket's customer, as any member who may change the ticket can; their messenger's
 * ticket tab shows it at once.
 */
const addComment = writes(PERMISSIONS.channelView)
  .input(z.object({ ticketId: z.string(), body: z.string().trim().min(1).max(5000) }))
  .output(Comment)
  .handler(async ({ input: { ticketId, body }, context: { tx, member } }) => {
    const ticket = await changeable(tx, member, ticketId);

    const [comment] = await tx
      .insert(ticketComments)
      .values({ orgId: member.orgId, ticketId, body, createdBy: member.userId })
      .returning(commentColumns);

    if (!comment) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await signalTickets(tx, member, ticket);

    return { ...comment, mine: true };
  });

/** Takes back a comment the caller wrote, from the customer's messenger too. */
const removeComment = writes(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }))
  .handler(async ({ input: { id }, context: { tx, member } }) => {
    const [comment] = await tx
      .select({ ticketId: ticketComments.ticketId })
      .from(ticketComments)
      .where(and(eq(ticketComments.id, id), eq(ticketComments.createdBy, member.userId)));

    if (!comment) throw new ORPCError('NOT_FOUND', { message: 'No such comment of yours' });

    const ticket = await changeable(tx, member, comment.ticketId);

    await tx.delete(ticketComments).where(eq(ticketComments.id, id));
    await signalTickets(tx, member, ticket);

    return { id };
  });

export const commentProcedures = { comments, addComment, removeComment };
