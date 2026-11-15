import type { PluginMember } from '@erxes/plugin-sdk';
import { eq, inArray, sql } from 'drizzle-orm';
import { PLUGIN } from '#/config.ts';
import { TICKET_EVENTS, TICKET_TIMELINE } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { pipelineStatuses, tickets } from '#/db/tickets.ts';

/** One entry on a ticket's timeline in core. */
type TicketEvent = {
  ticketId: string;
  type: string;
  summary: string;
  payload: Record<string, unknown>;
};

/** The fields a "changed" entry lists. */
const FIELDS = [
  'name',
  'description',
  'priority',
  'startDate',
  'targetDate',
  'attachments',
  'state',
] as const;

/** How the entry's summary names each field. */
const FIELD_NAMES: Record<(typeof FIELDS)[number], string> = {
  name: 'name',
  description: 'description',
  priority: 'priority',
  startDate: 'start date',
  targetDate: 'target date',
  attachments: 'attachments',
  state: 'state',
};

/**
 * Publishes the events with core's `core_publish_event()` in the caller's transaction, so they
 * land on each ticket's Activity tab exactly when the change commits.
 */
export const publish = async (tx: Tx, member: PluginMember, events: TicketEvent[]) => {
  if (events.length === 0) return;

  const calls = events.map(
    (event) => sql`core_publish_event(
      p_org_id => ${member.orgId},
      p_source => ${PLUGIN},
      p_type => ${event.type},
      p_payload => ${JSON.stringify(event.payload)}::jsonb,
      p_summary => ${event.summary},
      p_link => ${`/${PLUGIN}/tickets/${encodeURIComponent(event.ticketId)}`},
      p_actor_user_id => ${member.userId},
      p_entity_type => ${TICKET_TIMELINE},
      p_entity_id => ${event.ticketId}
    )`,
  );

  await tx.execute(sql`select ${sql.join(calls, sql`, `)}`);
};

/** What the timeline compares before and after a change, with the status's name. */
export const snapshot = (tx: Tx, ids: string[]) =>
  tx
    .select({
      id: tickets.id,
      number: tickets.number,
      name: tickets.name,
      description: tickets.description,
      priority: tickets.priority,
      startDate: tickets.startDate,
      targetDate: tickets.targetDate,
      attachments: tickets.attachments,
      state: tickets.state,
      assigneeId: tickets.assigneeId,
      pipelineId: tickets.pipelineId,
      statusId: tickets.statusId,
      status: pipelineStatuses.name,
    })
    .from(tickets)
    .innerJoin(pipelineStatuses, eq(pipelineStatuses.id, tickets.statusId))
    .where(inArray(tickets.id, ids));

type Snapshot = Awaited<ReturnType<typeof snapshot>>[number];

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

const pick = (row: Snapshot, fields: readonly string[]) =>
  Object.fromEntries(Object.entries(row).filter(([field]) => fields.includes(field)));

/** A new ticket's entry. */
export const createdEvent = (row: Snapshot): TicketEvent => ({
  ticketId: row.id,
  type: TICKET_EVENTS.created.type,
  summary: `Created ${row.name} in ${row.status}`,
  payload: pick(row, ['number', 'name', 'priority', 'assigneeId', 'pipelineId', 'statusId']),
});

/** Each ticket's entries for what differs between `before` and `after`. */
export const changeEvents = (before: Snapshot[], after: Snapshot[]): TicketEvent[] => {
  const was = new Map(before.map((row) => [row.id, row]));

  return after.flatMap((now) => {
    const old = was.get(now.id);

    if (!old) return [];

    const fields = FIELDS.filter((field) => !same(old[field], now[field]));

    const moved: TicketEvent = {
      ticketId: now.id,
      type: TICKET_EVENTS.moved.type,
      summary: `Moved from ${old.status} to ${now.status}`,
      payload: {
        fromPipelineId: old.pipelineId,
        toPipelineId: now.pipelineId,
        fromStatusId: old.statusId,
        toStatusId: now.statusId,
        fromNumber: old.number,
        toNumber: now.number,
      },
    };

    const assigned: TicketEvent = {
      ticketId: now.id,
      type: TICKET_EVENTS.assigned.type,
      summary: now.assigneeId ? 'Assigned the ticket' : 'Unassigned the ticket',
      payload: { fromAssigneeId: old.assigneeId, toAssigneeId: now.assigneeId },
    };

    const changed: TicketEvent = {
      ticketId: now.id,
      type: TICKET_EVENTS.fieldsChanged.type,
      summary: `Changed ${fields.map((field) => FIELD_NAMES[field]).join(', ')}`,
      payload: { fields, before: pick(old, fields), after: pick(now, fields) },
    };

    return [
      ...(old.statusId === now.statusId ? [] : [moved]),
      ...(old.assigneeId === now.assigneeId ? [] : [assigned]),
      ...(fields.length === 0 ? [] : [changed]),
    ];
  });
};
