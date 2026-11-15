import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { asc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { pipelineStatuses, tickets } from '#/db/tickets.ts';
import { writes } from '#/orpc.ts';
import { Attachment, Title } from '../fields.ts';
import { pipelineFor } from '../pipelines/pipelines.ts';
import {
  Description,
  firstStatusOf,
  Ids,
  nextNumbers,
  Priority,
  refreshSla,
  State,
  Ticket,
  type TicketRow,
  ticketColumns,
  ticketsFor,
} from './shared.ts';

/** What a change sets on tickets; a field left out stays. */
const Changes = z
  .object({
    name: Title,
    description: Description,
    priority: Priority,
    assigneeId: z.string().nullable(),
    startDate: z.date().nullable(),
    targetDate: z.date().nullable(),
    attachments: z.array(Attachment).max(50),
    state: State,
    statusId: z.string(),
    pipelineId: z.string(),
  })
  .partial();

type Change = z.infer<typeof Changes>;

const current = alias(pipelineStatuses, 'current_status');

/** `values[i]` for the i-th of `ids`, as one CASE over the ticket id. */
const byTicket = (ids: string[], values: (string | null)[]) =>
  sql`case ${tickets.id} ${sql.join(
    ids.map((id, index) => sql`when ${id} then ${values[index] ?? null}`),
    sql` `,
  )} end`;

/**
 * Moves tickets to another pipeline the caller belongs to, each to the first
 * status of the stage it is in, with the next numbers of that pipeline.
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

/** Unless the ticket is already there, `value` for a move to `statusId`. */
const onMove = (statusId: string, value: SQL | Date | string) =>
  sql`case when ${tickets.statusId} = ${statusId} then ${tickets.statusChangedAt} else ${value} end`;

/**
 * Applies one change to tickets the caller may change, in their transaction:
 * the fields, a status move, a pipeline move, then the SLA they imply.
 */
const changeTickets = async (
  tx: Tx,
  member: PluginMember,
  rows: TicketRow[],
  { statusId, pipelineId, ...fields }: Change,
) => {
  const ids = rows.map((row) => row.id);

  if (pipelineId) await moveToPipeline(tx, member, rows, pipelineId);

  if (statusId) await statusFor(tx, rows, statusId);

  const moved = statusId
    ? {
        statusId,
        statusChangedAt: onMove(statusId, sql`now()`),
        statusChangedBy: sql`case when ${tickets.statusId} = ${statusId}
          then ${tickets.statusChangedBy} else ${member.userId} end`,
      }
    : {};

  if (Object.keys(fields).length > 0 || statusId)
    await tx
      .update(tickets)
      .set({ ...fields, ...moved })
      .where(inArray(tickets.id, ids));

  if (statusId || pipelineId || fields.priority !== undefined) await refreshSla(tx, ids);

  return tx
    .select(ticketColumns)
    .from(tickets)
    .where(inArray(tickets.id, ids))
    .orderBy(asc(tickets.createdAt), asc(tickets.id));
};

/** Changes what is given on one ticket. */
const update = writes(PERMISSIONS.channelView)
  .input(Changes.omit({ statusId: true, pipelineId: true }).extend({ id: z.string() }))
  .output(Ticket)
  .handler(async ({ input: { id, ...change }, context: { tx, member } }) => {
    const [ticket] = await changeTickets(tx, member, await ticketsFor(tx, member, [id]), change);

    if (!ticket) throw new ORPCError('NOT_FOUND', { message: 'No such ticket' });

    return ticket;
  });

/** Moves a ticket to another status of its pipeline, as the board's drag does. */
const move = writes(PERMISSIONS.channelView)
  .input(z.object({ id: z.string(), statusId: z.string() }))
  .output(Ticket)
  .handler(async ({ input: { id, statusId }, context: { tx, member } }) => {
    const [ticket] = await changeTickets(tx, member, await ticketsFor(tx, member, [id]), {
      statusId,
    });

    if (!ticket) throw new ORPCError('NOT_FOUND', { message: 'No such ticket' });

    return ticket;
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
    })
      .extend({ ids: Ids })
      .refine(({ ids, ...change }) => Object.keys(change).length > 0, 'Pick a change')
      .refine(
        ({ statusId, pipelineId }) => !(statusId && pipelineId),
        'Move the tickets to a pipeline or a status, not both',
      ),
  )
  .output(z.array(Ticket))
  .handler(async ({ input: { ids, ...change }, context: { tx, member } }) =>
    changeTickets(tx, member, await ticketsFor(tx, member, ids), change),
  );

/** Deletes the selected tickets, all of them or none; their channels' admins may. */
const bulkRemove = writes(PERMISSIONS.channelView)
  .input(z.object({ ids: Ids }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    await ticketsFor(tx, member, input.ids, { remove: true });
    await tx.delete(tickets).where(inArray(tickets.id, input.ids));

    return { ids: input.ids };
  });

export const changeProcedures = { update, move, bulkUpdate, bulkRemove };
