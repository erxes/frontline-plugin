import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { channelMembers } from '#/db/schema.ts';
import { pipelines, pipelineStatuses, tickets } from '#/db/tickets.ts';
import { writes } from '#/orpc.ts';
import { membership } from '../channels/access.ts';
import { Ids } from '../fields.ts';
import { pipelineFor } from '../pipelines/pipelines.ts';
import { statusRights } from '../pipelines/rights.ts';
import { assertTags } from '../tags/tags.ts';
import { assertTeam } from '../teams/teams.ts';
import { auditRemoved, changeEvents, publish, snapshot } from './events.ts';
import {
  firstStatusOf,
  nextNumbers,
  refine,
  refreshSla,
  signalTickets,
  Ticket,
  ticketById,
  ticketsById,
  ticketsFor,
} from './shared.ts';

type TicketRow = Awaited<ReturnType<typeof ticketsFor>>[number];

/** What a change sets on tickets; a field left out stays. */
const Changes = createUpdateSchema(tickets, refine).pick({
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
  state: true,
  statusId: true,
  pipelineId: true,
});

type Change = z.infer<typeof Changes> & {
  /** The ticket's custom field values as core checked them, in place of the old ones. */
  properties?: (typeof tickets.$inferSelect)['propertiesData'];
};

/** Refuses tags, branches and departments that don't exist, so a ticket names only real ones. */
export const assertLinks = async (
  tx: Tx,
  { tagIds, branchId, departmentId }: Pick<Change, 'tagIds' | 'branchId' | 'departmentId'>,
) => {
  await assertTags(tx, 'ticket', tagIds ?? []);
  await assertTeam(tx, 'branch', branchId);
  await assertTeam(tx, 'department', departmentId);
};

/**
 * Refuses a change the tickets' statuses keep from `member`: their fields while
 * `canEditMemberIds` leaves them out, a move while `canMoveMemberIds` does, and a move into a
 * private status they aren't in. The channel's admins pass.
 */
const assertRights = async (
  tx: Tx,
  member: PluginMember,
  ids: string[],
  { edits, moves, statusId }: { edits: boolean; moves: boolean; statusId?: string },
) => {
  const rights = statusRights(member);

  const held = await tx
    .select({ name: pipelineStatuses.name, canEdit: rights.canEdit, canMove: rights.canMove })
    .from(tickets)
    .innerJoin(pipelineStatuses, eq(pipelineStatuses.id, tickets.statusId))
    .leftJoin(channelMembers, membership(member, tickets.channelId))
    .where(inArray(tickets.id, ids));

  const uneditable = edits && held.find((row) => !row.canEdit);
  const unmovable = moves && held.find((row) => !row.canMove);

  if (uneditable)
    throw new ORPCError('FORBIDDEN', {
      message: `Only the members ${uneditable.name} lists may edit its tickets`,
    });

  if (unmovable)
    throw new ORPCError('FORBIDDEN', {
      message: `Only the members ${unmovable.name} lists may move its tickets`,
    });

  if (!statusId) return;

  const [target] = await tx
    .select({ canSee: rights.canSee })
    .from(pipelineStatuses)
    .innerJoin(pipelines, eq(pipelines.id, pipelineStatuses.pipelineId))
    .leftJoin(channelMembers, membership(member, pipelines.channelId))
    .where(eq(pipelineStatuses.id, statusId));

  if (target && !target.canSee)
    throw new ORPCError('FORBIDDEN', { message: 'That status is private to its members' });
};

const current = alias(pipelineStatuses, 'current_status');

/** `values[i]` for the i-th of `ids`, as one CASE over the ticket id. */
const byTicket = (ids: string[], values: (string | null)[]) =>
  sql`case ${tickets.id} ${sql.join(
    ids.map((id, index) => sql`when ${id} then ${values[index] ?? null}`),
    sql` `,
  )} end`;

/**
 * Moves tickets to another pipeline the caller belongs to, each to the first status of the
 * stage it is in, with the next numbers of that pipeline.
 */
const moveToPipeline = async (
  tx: Tx,
  member: PluginMember,
  rows: TicketRow[],
  pipelineId: string,
) => {
  const target = await pipelineFor(tx, member, pipelineId, { change: false });
  const ids = rows.filter((row) => row.pipelineId !== pipelineId).map((row) => row.id);

  if (ids.length === 0) return;

  const mapped = await tx
    .select({ id: tickets.id, statusId: firstStatusOf(pipelineId, current.type) })
    .from(tickets)
    .innerJoin(current, eq(current.id, tickets.statusId))
    .where(inArray(tickets.id, ids))
    .orderBy(asc(tickets.createdAt), asc(tickets.id));

  if (mapped.some((row) => !row.statusId))
    throw new ORPCError('BAD_REQUEST', {
      message: `${target.name} has no status in the stage of every ticket`,
    });

  const numbers = await nextNumbers(tx, pipelineId, mapped.length);
  const order = mapped.map((row) => row.id);

  await tx
    .update(tickets)
    .set({
      channelId: target.channelId,
      pipelineId,
      statusId: byTicket(
        order,
        mapped.map((row) => row.statusId),
      ),
      number: byTicket(order, numbers),
      statusChangedAt: new Date(),
      statusChangedBy: member.userId,
    })
    .where(inArray(tickets.id, order));
};

/** The status every ticket moves to, which must be in their pipeline. */
const statusFor = async (tx: Tx, rows: TicketRow[], statusId: string) => {
  const [status] = await tx
    .select({ pipelineId: pipelineStatuses.pipelineId })
    .from(pipelineStatuses)
    .where(eq(pipelineStatuses.id, statusId));

  if (!status) throw new ORPCError('NOT_FOUND', { message: 'No such status' });

  if (rows.some((row) => row.pipelineId !== status.pipelineId))
    throw new ORPCError('BAD_REQUEST', { message: "Pick a status of the tickets' pipeline" });
};

/** Unless the ticket is already in `statusId`, `value`; otherwise the column as it is. */
const onMove = (
  statusId: string,
  column: typeof tickets.statusChangedAt | typeof tickets.statusChangedBy,
  value: unknown,
) => sql`case when ${tickets.statusId} = ${statusId} then ${column} else ${value} end`;

/**
 * Applies one change to tickets the caller may change, in their transaction: the fields, a
 * status move, a pipeline move, the SLA they imply, then each ticket's timeline events.
 */
export const changeTickets = async (
  tx: Tx,
  member: PluginMember,
  rows: TicketRow[],
  { statusId, pipelineId, properties, ...fields }: Change,
) => {
  const ids = rows.map((row) => row.id);
  const before = await snapshot(tx, ids);
  const edits = Object.keys(fields).length > 0 || properties !== undefined;

  const moves = rows.some(
    (row) =>
      (statusId !== undefined && row.statusId !== statusId) ||
      (pipelineId !== undefined && row.pipelineId !== pipelineId),
  );

  await assertRights(tx, member, ids, { edits, moves, statusId });
  await assertLinks(tx, fields);

  if (pipelineId) await moveToPipeline(tx, member, rows, pipelineId);

  if (statusId) await statusFor(tx, rows, statusId);

  const moved = statusId
    ? {
        statusId,
        statusChangedAt: onMove(statusId, tickets.statusChangedAt, sql`now()`),
        statusChangedBy: onMove(statusId, tickets.statusChangedBy, member.userId),
      }
    : {};

  if (edits || statusId)
    await tx
      .update(tickets)
      .set({
        ...fields,
        ...moved,
        ...(properties ? { propertiesData: properties } : {}),
      })
      .where(inArray(tickets.id, ids));

  if (statusId || pipelineId || fields.priority !== undefined) await refreshSla(tx, ids);

  await publish(tx, member, changeEvents(before, await snapshot(tx, ids)));
  await signalTickets(tx, member);
};

/**
 * Changes what is given on one ticket, or moves it to another status of its pipeline. Its
 * custom fields change through `tickets.properties.save`, which core checks.
 */
const update = writes(PERMISSIONS.channelView)
  .input(Changes.omit({ pipelineId: true }).extend({ id: z.string() }))
  .output(Ticket)
  .handler(async ({ input: { id, ...change }, context: { tx, member } }) => {
    await changeTickets(tx, member, await ticketsFor(tx, member, [id]), change);

    return ticketById(tx, member, id);
  });

/** Assigns, prioritises, moves or archives the selected tickets: all of them, or none. */
const bulkUpdate = writes(PERMISSIONS.channelView)
  .input(
    Changes.pick({
      assigneeId: true,
      priority: true,
      statusId: true,
      pipelineId: true,
      state: true,
      tagIds: true,
      branchId: true,
      departmentId: true,
    })
      .extend({ ids: Ids })
      .refine(({ ids, ...change }) => Object.keys(change).length > 0, 'Pick a change')
      .refine(
        ({ statusId, pipelineId }) => !(statusId && pipelineId),
        'Move the tickets to a pipeline or a status, not both',
      ),
  )
  .output(z.array(Ticket))
  .handler(async ({ input: { ids, ...change }, context: { tx, member } }) => {
    await changeTickets(tx, member, await ticketsFor(tx, member, ids), change);

    return ticketsById(tx, member, ids);
  });

/** Deletes the selected tickets, all of them or none; their channels' admins may. */
const bulkRemove = writes(PERMISSIONS.channelView)
  .input(z.object({ ids: Ids }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    await ticketsFor(tx, member, input.ids, { remove: true });

    const removed = await tx
      .delete(tickets)
      .where(inArray(tickets.id, input.ids))
      .returning({ id: tickets.id, name: tickets.name });

    await auditRemoved(tx, member, removed);
    await signalTickets(tx, member);

    return { ids: input.ids };
  });

export const changeProcedures = { update, bulkUpdate, bulkRemove };
