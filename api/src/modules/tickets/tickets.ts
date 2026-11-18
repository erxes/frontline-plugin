import { type ConditionGroup, CustomFieldsPatch } from '@erxes/core-contract';
import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, count, eq, ilike, or, sql } from 'drizzle-orm';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { channelMembers } from '#/db/schema.ts';
import { pipelineStatuses, tickets } from '#/db/tickets.ts';
import { reads, readsWithCore, writesWithCore } from '#/orpc.ts';
import { membership } from '../channels/access.ts';
import { compileFilter, type FilterFields } from '@erxes/plugin-sdk/filter';
import { FilterInput, filtersBy, likeText } from '../filter.ts';
import { firstPageCount, orderOf, PageInput, PageOutput } from '../paging.ts';
import { pipelineFor } from '../pipelines/pipelines.ts';
import { assertLinks } from './changes.ts';
import { createdEvent, publish, snapshot } from './events.ts';
import { checkProperties, propertyFilter } from './properties.ts';
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
  'subject.name': { type: 'text', expr: tickets.name },
  'subject.number': { type: 'text', expr: tickets.number },
  'subject.channelId': { type: 'select', expr: tickets.channelId },
  'subject.statusId': { type: 'select', expr: tickets.statusId },
  'subject.priority': { type: 'select', expr: sql`${tickets.priority}::text` },
  'subject.assigneeId': { type: 'member', expr: tickets.assigneeId },
  'subject.assignedMemberIds': { type: 'member', array: true, expr: tickets.assignedMemberIds },
  'subject.subscribedUserIds': { type: 'member', array: true, expr: tickets.subscribedUserIds },
  'subject.tagIds': { type: 'tags', expr: tickets.tagIds },
  'subject.branchId': { type: 'select', expr: tickets.branchId },
  'subject.departmentId': { type: 'select', expr: tickets.departmentId },
  'subject.customerId': { type: 'select', expr: tickets.customerId },
  'subject.companyId': { type: 'select', expr: tickets.companyId },
  'subject.state': { type: 'select', expr: tickets.state },
  'subject.firstResponseSla': { type: 'select', expr: firstResponseSla },
  'subject.resolutionSla': { type: 'select', expr: resolutionSla },
  'subject.createdBy': { type: 'member', expr: tickets.createdBy },
  'subject.createdAt': { type: 'date', expr: tickets.createdAt },
  'subject.updatedAt': { type: 'date', expr: tickets.updatedAt },
  'subject.startDate': { type: 'date', expr: tickets.startDate },
  'subject.targetDate': { type: 'date', expr: tickets.targetDate },
  'subject.statusChangedAt': { type: 'date', expr: tickets.statusChangedAt },
};

/**
 * The tickets `member` sees, in `pipelineId` and `statusId` when given (a board column asks for
 * its status), narrowed by the filter bar. `search` matches the name or number; archived tickets
 * show only when the filter asks for a state. `fromCore` types the rules on custom fields
 * (`propertyFilter`). The query joins `channelMembers` by `membership`, as `ticketRows` does.
 */
export const ticketsMatching = (
  member: PluginMember,
  input: {
    search?: string;
    filter?: ConditionGroup | null;
    pipelineId?: string;
    statusId?: string;
  },
  fromCore: FilterFields,
) => {
  const search = input.search ? likeText(input.search) : undefined;
  const filter = input.filter ?? undefined;

  return and(
    seenBy(member),
    input.pipelineId ? eq(tickets.pipelineId, input.pipelineId) : undefined,
    input.statusId ? eq(tickets.statusId, input.statusId) : undefined,
    filtersBy(filter, 'subject.state') ? undefined : eq(tickets.state, 'active'),
    search ? or(ilike(tickets.name, search), ilike(tickets.number, search)) : undefined,
    compileFilter({ ...TICKET_FILTER, ...fromCore }, filter, { me: member.userId }),
  );
};

/**
 * The tickets of the caller's channels, or every channel's for a member who manages them all,
 * `limit` at a time (`ticketsMatching`), and how many match. Sorted by the last change unless
 * `sort` says creation, newest first unless `ascending`.
 * A rule on a custom field asks core for its type first.
 */
const list = readsWithCore(
  PERMISSIONS.channelView,
  z.object({
    ...FilterInput,
    ...PageInput,
    pipelineId: z.string().optional(),
    statusId: z.string().optional(),
    sort: z.enum(['updatedAt', 'createdAt']).default('updatedAt'),
    ascending: z.boolean().default(false),
  }),
  (member, input) => propertyFilter(member.orgId, input.filter),
)
  .output(
    z.object({
      tickets: z.array(Ticket),
      ...PageOutput,
    }),
  )
  .handler(async ({ input, context: { tx, member, fromCore } }) => {
    const matches = ticketsMatching(member, input, fromCore);

    const order = orderOf(tickets, tickets[input.sort], input.ascending);

    const rows = await ticketRows(tx, member)
      .where(and(matches, order.after(input.cursor)))
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const totalCount = await firstPageCount(input.cursor, () =>
      tx
        .select({ value: count() })
        .from(tickets)
        .leftJoin(channelMembers, membership(member, tickets.channelId))
        .where(matches),
    );

    const { items, nextCursor } = await order.page(tx, rows, input.limit);

    return { tickets: items, nextCursor, totalCount };
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
  'orgId' | 'channelId' | 'pipelineId' | 'statusId' | 'number' | 'createdBy' | 'statusChangedBy'
> & { statusId?: string };

/**
 * Files a ticket in `pipeline` by `actor`, a member or, with no user, the customer it names:
 * its links checked, in `statusId` or the pipeline's first status. The caller checks that
 * `actor` may file in the pipeline, and its properties with `checkProperties`.
 */
export const fileTicket = async (
  tx: Tx,
  actor: { orgId: string; userId: string | null },
  pipeline: { id: string; channelId: string },
  input: NewTicket,
) => {
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
    channelId: pipeline.channelId,
    statusId: status.id,
    createdBy: actor.userId,
  });
};

/**
 * A new ticket in a pipeline of a channel the caller belongs to, in `statusId` or the pipeline's
 * first status, numbered by the pipeline and due by its SLA. Core checks its custom fields
 * first.
 */
const create = writesWithCore(
  PERMISSIONS.channelView,
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
    .extend({ propertiesData: CustomFieldsPatch.default({}) }),
  (member, input) => checkProperties(member.orgId, input.pipelineId, {}, input.propertiesData),
)
  .output(Ticket)
  .handler(async ({ input, context: { tx, member, fromCore } }) => {
    const pipeline = await pipelineFor(tx, member, input.pipelineId, { change: false });

    return ticketById(
      tx,
      member,
      await fileTicket(tx, member, pipeline, { ...input, propertiesData: fromCore }),
    );
  });

export const ticketProcedures = { list, get, create };
