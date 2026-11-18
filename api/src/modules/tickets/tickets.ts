import { ORPCError } from '@orpc/server';
import { and, asc, count, eq, ilike, or, sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { channelMembers } from '#/db/schema.ts';
import { pipelineStatuses, tickets } from '#/db/tickets.ts';
import { reads, writes } from '#/orpc.ts';
import { membership } from '../channels/access.ts';
import { FilterInput, type FilterFields, filtersBy, filterSql, likeText } from '../filter.ts';
import { orderOf, PageInput } from '../paging.ts';
import { pipelineFor } from '../pipelines/pipelines.ts';
import { assertLinks } from './changes.ts';
import { createdEvent, publish, snapshot } from './events.ts';
import { parseProperties, PropertiesPatch } from './properties.ts';
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
  'subject.statusId': { kind: 'select', expr: tickets.statusId },
  'subject.priority': { kind: 'select', expr: sql`${tickets.priority}::text` },
  'subject.assigneeId': { kind: 'member', expr: tickets.assigneeId },
  'subject.assignedMemberIds': { kind: 'members', expr: tickets.assignedMemberIds },
  'subject.subscribedUserIds': { kind: 'members', expr: tickets.subscribedUserIds },
  'subject.tagIds': { kind: 'tags', expr: tickets.tagIds },
  'subject.branchId': { kind: 'select', expr: tickets.branchId },
  'subject.departmentId': { kind: 'select', expr: tickets.departmentId },
  'subject.customerId': { kind: 'select', expr: tickets.customerId },
  'subject.companyId': { kind: 'select', expr: tickets.companyId },
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
 * `limit` at a time, in `pipelineId` when given, narrowed by the filter bar, and how many match.
 * `search` matches the name or number; archived tickets show only when the filter asks for a
 * state. Sorted by the last change unless `sort` says creation, newest first unless `ascending`.
 */
const list = reads(PERMISSIONS.channelView)
  .input(
    z.object({
      ...FilterInput,
      ...PageInput,
      pipelineId: z.string().optional(),
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
      input.pipelineId ? eq(tickets.pipelineId, input.pipelineId) : undefined,
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

    const { items, nextCursor } = await order.page(tx, rows, input.limit);

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
 * Adds a ticket numbered by its pipeline and due by its SLA, and publishes its creation, by a
 * member or by the plugin itself (`userId` null), as a survey's vote count does.
 */
export const insertTicket = async (
  tx: Tx,
  actor: { orgId: string; userId: string | null },
  values: Omit<typeof tickets.$inferInsert, 'orgId' | 'number' | 'statusChangedBy'>,
) => {
  const [number = null] = await nextNumbers(tx, values.pipelineId, 1);

  const [created] = await tx
    .insert(tickets)
    .values({ ...values, orgId: actor.orgId, number, statusChangedBy: actor.userId })
    .returning({ id: tickets.id });

  if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

  await refreshSla(tx, [created.id]);
  await publish(
    tx,
    actor,
    (await snapshot(tx, [created.id])).map((row) => createdEvent(row)),
  );
  await signalTickets(tx, actor);

  return created.id;
};

type NewTicket = Omit<
  typeof tickets.$inferInsert,
  | 'orgId'
  | 'channelId'
  | 'pipelineId'
  | 'statusId'
  | 'number'
  | 'createdBy'
  | 'statusChangedBy'
  | 'propertiesData'
> & { statusId?: string; propertiesData: Record<string, unknown> };

/**
 * Files a ticket in `pipeline` by `actor`, a member or, with no user, the customer it names:
 * its properties and links checked, in `statusId` or the pipeline's first status. The caller
 * checks that `actor` may file in the pipeline.
 */
export const fileTicket = async (
  tx: Tx,
  actor: { orgId: string; userId: string | null },
  pipeline: { id: string; channelId: string },
  { propertiesData, ...input }: NewTicket,
) => {
  const properties = await parseProperties(tx, pipeline.id, propertiesData, { create: true });

  await assertLinks(tx, input);

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

  return insertTicket(tx, actor, {
    ...input,
    pipelineId: pipeline.id,
    propertiesData: properties,
    channelId: pipeline.channelId,
    statusId: status.id,
    createdBy: actor.userId,
  });
};

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
        assignedMemberIds: true,
        subscribedUserIds: true,
        tagIds: true,
        branchId: true,
        departmentId: true,
        customerId: true,
        companyId: true,
        startDate: true,
        targetDate: true,
        attachments: true,
      })
      .partial({
        statusId: true,
        description: true,
        priority: true,
        assignedMemberIds: true,
        subscribedUserIds: true,
        tagIds: true,
        attachments: true,
      })
      .extend({ propertiesData: PropertiesPatch.default({}) }),
  )
  .output(Ticket)
  .handler(async ({ input, context: { tx, member } }) => {
    const pipeline = await pipelineFor(tx, member, input.pipelineId, { change: false });

    return ticketById(tx, member, await fileTicket(tx, member, pipeline, input));
  });

export const ticketProcedures = { list, get, create };
