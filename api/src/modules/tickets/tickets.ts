import { ORPCError } from '@orpc/server';
import { and, asc, count, eq, ilike, or, sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { channelMembers } from '#/db/schema.ts';
import { pipelineStatuses, tickets } from '#/db/tickets.ts';
import { reads, writes } from '#/orpc.ts';
import { membership } from '../channels/access.ts';
import { FilterInput, type FilterFields, filtersBy, filterSql, likeText } from '../filter.ts';
import { orderOf, PageInput, pageOf } from '../paging.ts';
import { pipelineFor } from '../pipelines/pipelines.ts';
import {
  firstResponseSla,
  nextNumbers,
  refine,
  refreshSla,
  resolutionSla,
  seenBy,
  signalTickets,
  Ticket,
  ticketById,
  ticketRows,
} from './shared.ts';

/** What the list's filter bar narrows tickets by (`ui/src/modules/tickets/TicketFilter.tsx`). */
const TICKET_FILTER: FilterFields = {
  'subject.name': { kind: 'text', expr: tickets.name },
  'subject.number': { kind: 'text', expr: tickets.number },
  'subject.channelId': { kind: 'select', expr: tickets.channelId },
  'subject.pipelineId': { kind: 'select', expr: tickets.pipelineId },
  'subject.statusId': { kind: 'select', expr: tickets.statusId },
  'subject.priority': { kind: 'select', expr: sql`${tickets.priority}::text` },
  'subject.assigneeId': { kind: 'member', expr: tickets.assigneeId },
  'subject.state': { kind: 'select', expr: tickets.state },
  'subject.firstResponseSla': { kind: 'select', expr: firstResponseSla },
  'subject.resolutionSla': { kind: 'select', expr: resolutionSla },
  'subject.createdBy': { kind: 'member', expr: tickets.createdBy },
  'subject.createdAt': { kind: 'date', expr: tickets.createdAt },
  'subject.updatedAt': { kind: 'date', expr: tickets.updatedAt },
  'subject.startDate': { kind: 'date', expr: tickets.startDate },
  'subject.targetDate': { kind: 'date', expr: tickets.targetDate },
  'subject.statusChangedAt': { kind: 'date', expr: tickets.statusChangedAt },
};

/**
 * The tickets of the caller's channels, or every channel's for a member who manages them all,
 * `limit` at a time, narrowed by the filter bar, and how many match. `search` matches the name
 * or number; archived tickets show only when the filter asks for a state. Sorted by the last
 * change unless `sort` says creation, newest first unless `ascending`.
 */
const list = reads(PERMISSIONS.channelView)
  .input(
    z.object({
      ...FilterInput,
      ...PageInput,
      sort: z.enum(['updatedAt', 'createdAt']).default('updatedAt'),
      ascending: z.boolean().default(false),
    }),
  )
  .output(
    z.object({
      tickets: z.array(Ticket),
      nextCursor: z.string().nullable(),
      totalCount: z.number(),
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    const search = input.search ? likeText(input.search) : undefined;

    const matches = and(
      seenBy(member),
      filtersBy(input.filter, 'subject.state') ? undefined : eq(tickets.state, 'active'),
      search ? or(ilike(tickets.name, search), ilike(tickets.number, search)) : undefined,
      input.filter ? filterSql(TICKET_FILTER, input.filter, member.userId) : undefined,
    );

    const order = orderOf(tickets, tickets[input.sort], input.ascending);

    const rows = await ticketRows(tx, member)
      .where(and(matches, order.after(input.cursor)))
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const [total] = await tx
      .select({ value: count() })
      .from(tickets)
      .leftJoin(channelMembers, membership(member, tickets.channelId))
      .where(matches);

    const { items, nextCursor } = pageOf(rows, input.limit);

    return { tickets: items, nextCursor, totalCount: total?.value ?? 0 };
  });

/** One ticket, for the members of its channel. */
const get = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Ticket)
  .handler(async ({ input, context: { tx, member } }) => {
    const [ticket] = await ticketRows(tx, member).where(
      and(eq(tickets.id, input.id), seenBy(member)),
    );

    if (!ticket) throw new ORPCError('NOT_FOUND', { message: 'No such ticket' });

    return ticket;
  });

/**
 * A new ticket in a pipeline of a channel the caller belongs to, in `statusId` or the pipeline's
 * first status, numbered by the pipeline and due by its SLA.
 */
const create = writes(PERMISSIONS.channelView)
  .input(
    createInsertSchema(tickets, refine)
      .pick({
        pipelineId: true,
        statusId: true,
        name: true,
        description: true,
        priority: true,
        assigneeId: true,
        startDate: true,
        targetDate: true,
        attachments: true,
      })
      .partial({ statusId: true, description: true, priority: true, attachments: true }),
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
    await signalTickets(tx, member);

    return ticketById(tx, member, created.id);
  });

export const ticketProcedures = { list, get, create };
