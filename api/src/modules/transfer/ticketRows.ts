import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { Tx } from '#/db/client.ts';
import { channelMembers } from '#/db/schema.ts';
import { tags } from '#/db/tags.ts';
import {
  pipelines,
  pipelineStatuses,
  PRIORITY_NAMES,
  TICKET_STATES,
  tickets,
} from '#/db/tickets.ts';
import { membership } from '../channels/access.ts';
import { seenBy } from '../tickets/shared.ts';
import type { askedMember } from '../channels/access.ts';
import { listOf, refuse } from './shared.ts';

type Member = ReturnType<typeof askedMember>;

type Row = Record<string, string>;

/** A priority cell: its name in any case, or its number. */
export const priorityOf = (cell: string) => {
  const at = PRIORITY_NAMES.findIndex((name) => name.toLowerCase() === cell.toLowerCase());
  const priority = at >= 0 ? at : Number(cell);

  if (!PRIORITY_NAMES[priority]) throw refuse(`Priority is one of ${PRIORITY_NAMES.join(', ')}`);

  return priority;
};

/** A state cell, active or archived in any case. */
export const stateOf = (cell: string) => {
  const state = TICKET_STATES.find((one) => one === cell.toLowerCase());

  if (!state) throw refuse(`State is one of ${TICKET_STATES.join(', ')}`);

  return state;
};

/** The ticket the row's ID names, among those the member sees, locked until the row is done. */
export const ticketOfRow = async (tx: Tx, member: Member, row: Row) => {
  if (!row.id) return undefined;

  const [found] = await tx
    .select({
      id: tickets.id,
      pipelineId: tickets.pipelineId,
      pipeline: pipelines.name,
      description: tickets.description,
      properties: tickets.propertiesData,
    })
    .from(tickets)
    .innerJoin(pipelines, eq(pipelines.id, tickets.pipelineId))
    .leftJoin(channelMembers, membership(member, tickets.channelId))
    .where(and(eq(tickets.id, row.id), seenBy(member)))
    .for('update', { of: tickets });

  return found;
};

/**
 * The pipeline of the row: a ticket it updates stays in its own, which the cell may name; a new
 * one goes in the pipeline of the member's channels the cell names, by name or id.
 */
export const pipelineOfRow = async (
  tx: Tx,
  member: Member,
  cell: string | undefined,
  found: { pipelineId: string; pipeline: string } | undefined,
) => {
  if (found) {
    const same =
      !cell || cell === found.pipelineId || cell.toLowerCase() === found.pipeline.toLowerCase();

    if (!same) throw refuse('Move a ticket to another pipeline in frontline');

    return found.pipelineId;
  }

  if (!cell) throw refuse('Pipeline is required');

  const named = await tx
    .select({ id: pipelines.id })
    .from(pipelines)
    .innerJoin(channelMembers, membership(member, pipelines.channelId))
    .where(or(eq(pipelines.id, cell), sql`lower(${pipelines.name}) = lower(${cell})`));

  if (named.length > 1)
    throw refuse(`${named.length} of your pipelines are named ${cell}; use its ID`);

  const [match] = named;

  if (!match) throw refuse(`No pipeline ${cell} in your channels`);

  return match.id;
};

/** The status the row names in the pipeline, or undefined for none. */
export const statusOfRow = async (tx: Tx, pipelineId: string, cell: string | undefined) => {
  if (!cell) return undefined;

  const [status] = await tx
    .select({ id: pipelineStatuses.id })
    .from(pipelineStatuses)
    .where(
      and(
        eq(pipelineStatuses.pipelineId, pipelineId),
        sql`lower(${pipelineStatuses.name}) = lower(${cell})`,
      ),
    );

  if (!status) throw refuse(`The pipeline has no status ${cell}`);

  return status.id;
};

/** The ticket tags the cell names; each must exist. */
export const tagIdsOf = async (tx: Tx, cell: string | undefined) => {
  const names = listOf(cell).map((name) => name.toLowerCase());

  if (!names.length) return undefined;

  const found = await tx
    .select({ id: tags.id, name: sql<string>`lower(${tags.name})` })
    .from(tags)
    .where(and(eq(tags.type, 'ticket'), inArray(sql`lower(${tags.name})`, names)));

  const missing = names.find((name) => !found.some((tag) => tag.name === name));

  if (missing) throw refuse(`No ticket tag ${missing}`);

  return found.map((tag) => tag.id);
};
