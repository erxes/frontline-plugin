import { ORPCError } from '@orpc/server';
import { and, asc, count, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { channelMembers } from '#/db/schema.ts';
import { pipelineStatuses, TICKET_STATES, tickets } from '#/db/tickets.ts';
import { reads, writes } from '#/orpc.ts';
import { channelFor, likeText, managesAll } from '../channels/access.ts';
import { Attachment, Title } from '../fields.ts';
import { orderOf, PageInput, pageOf } from '../paging.ts';
import { pipelineFor } from '../pipelines/pipelines.ts';
import {
  Description,
  nextNumbers,
  Priority,
  refreshSla,
  Ticket,
  ticketColumns,
  ticketsFor,
} from './shared.ts';

const Filters = z.object({
  channelId: z.string().optional(),
  pipelineId: z.string().optional(),
  statusId: z.string().optional(),
  /** A member's tickets, or null for the unassigned ones. */
  assigneeId: z.string().nullable().optional(),
  priority: Priority.optional(),
  /** Part of a name or number. */
  search: z.string().trim().max(200).optional(),
  state: z.enum([...TICKET_STATES, 'all']).default('active'),
  sort: z.enum(['updatedAt', 'createdAt']).default('updatedAt'),
  ascending: z.boolean().default(false),
});

/**
 * Tickets that match the filters, `limit` at a time, and how many match. A
 * member sees the tickets of the channels they belong to; channel managers see
 * every channel's.
 */
const list = reads(PERMISSIONS.channelView)
  .input(Filters.extend(PageInput))
  .output(
    z.object({
      tickets: z.array(Ticket),
      nextCursor: z.string().nullable(),
      totalCount: z.number(),
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    if (input.pipelineId) await pipelineFor(tx, member, input.pipelineId, { change: false });
    else if (input.channelId) await channelFor(tx, member, input.channelId, { change: false });

    const scoped = Boolean(input.channelId || input.pipelineId) || managesAll(member);
    const search = input.search ? likeText(input.search) : undefined;

    const matches = and(
      scoped
        ? undefined
        : inArray(
            tickets.channelId,
            tx
              .select({ id: channelMembers.channelId })
              .from(channelMembers)
              .where(eq(channelMembers.userId, member.userId)),
          ),
      input.channelId ? eq(tickets.channelId, input.channelId) : undefined,
      input.pipelineId ? eq(tickets.pipelineId, input.pipelineId) : undefined,
      input.statusId ? eq(tickets.statusId, input.statusId) : undefined,
      input.assigneeId === null ? isNull(tickets.assigneeId) : undefined,
      input.assigneeId ? eq(tickets.assigneeId, input.assigneeId) : undefined,
      input.priority === undefined ? undefined : eq(tickets.priority, input.priority),
      input.state === 'all' ? undefined : eq(tickets.state, input.state),
      search ? or(ilike(tickets.name, search), ilike(tickets.number, search)) : undefined,
    );

    const order = orderOf(tickets, tickets[input.sort], input.ascending);

    const rows = await tx
      .select(ticketColumns)
      .from(tickets)
      .where(and(matches, order.after(input.cursor)))
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const [total] = await tx.select({ value: count() }).from(tickets).where(matches);
    const { items, nextCursor } = pageOf(rows, input.limit);

    return { tickets: items, nextCursor, totalCount: total?.value ?? 0 };
  });

/** One ticket, for the members of its channel. */
const get = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Ticket)
  .handler(async ({ input, context: { tx, member } }) => {
    const [ticket] = await ticketsFor(tx, member, [input.id]);

    if (!ticket) throw new ORPCError('NOT_FOUND', { message: 'No such ticket' });

    return ticket;
  });

/**
 * A new ticket in a pipeline of a channel the caller belongs to, in `statusId`
 * or the pipeline's first status, numbered by the pipeline and due by its SLA.
 */
const create = writes(PERMISSIONS.channelView)
  .input(
    z.object({
      pipelineId: z.string(),
      statusId: z.string().optional(),
      name: Title,
      description: Description.optional(),
      priority: Priority.optional(),
      assigneeId: z.string().nullable().optional(),
      startDate: z.date().nullable().optional(),
      targetDate: z.date().nullable().optional(),
      attachments: z.array(Attachment).max(50).optional(),
    }),
  )
  .output(Ticket)
  .handler(async ({ input, context: { tx, member } }) => {
    const pipeline = await pipelineFor(tx, member, input.pipelineId, { change: false });

    const [status] = await tx
      .select({ id: pipelineStatuses.id })
      .from(pipelineStatuses)
      .where(
        and(
          eq(pipelineStatuses.pipelineId, pipeline.id),
          input.statusId ? eq(pipelineStatuses.id, input.statusId) : undefined,
        ),
      )
      .orderBy(asc(pipelineStatuses.type), asc(pipelineStatuses.order))
      .limit(1);

    if (!status) throw new ORPCError('BAD_REQUEST', { message: 'Pick a status of this pipeline' });

    const [number = null] = await nextNumbers(tx, pipeline.id, 1);

    const [created] = await tx
      .insert(tickets)
      .values({
        ...input,
        orgId: member.orgId,
        channelId: pipeline.channelId,
        statusId: status.id,
        number,
        statusChangedBy: member.userId,
        createdBy: member.userId,
      })
      .returning({ id: tickets.id });

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await refreshSla(tx, [created.id]);

    const [ticket] = await tx.select(ticketColumns).from(tickets).where(eq(tickets.id, created.id));

    if (!ticket) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return ticket;
  });

export const ticketProcedures = { list, get, create };
