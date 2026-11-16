import { eq, inArray } from 'drizzle-orm';
import { PLUGIN } from '#/config.ts';
import { TICKET_EVENTS, TICKET_REMOVED, TICKET_TIMELINE } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { pipelineStatuses, tickets } from '#/db/tickets.ts';
import { auditRemoved as audit, publishEvents, type RecordEvent, same } from '../events.ts';

/** Who made the change: a member, or the plugin itself (`userId` null), as a job does. */
type Actor = { orgId: string; userId: string | null };

/** One entry on a ticket's timeline in core, on its customer's too, and who hears of it. */
export type TicketEvent = Omit<RecordEvent, 'entityId'> & { ticketId: string };

/** The fields a "changed" entry lists. */
const FIELDS = [
  'name',
  'description',
  'priority',
  'startDate',
  'targetDate',
  'attachments',
  'state',
  'subscribedUserIds',
  'tagIds',
  'propertiesData',
  'branchId',
  'departmentId',
  'customerId',
  'companyId',
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
  subscribedUserIds: 'followers',
  tagIds: 'tags',
  propertiesData: 'properties',
  branchId: 'branch',
  departmentId: 'department',
  customerId: 'customer',
  companyId: 'company',
};

/** The ticket's timeline in core, by `actor`; each event also goes to core's audit log. */
const timelineOf = (actor: Actor) => ({
  orgId: actor.orgId,
  actorUserId: actor.userId,
  entityType: TICKET_TIMELINE,
  linkOf: (id: string) => `/${PLUGIN}/tickets/${encodeURIComponent(id)}`,
  audited: true,
});

/**
 * Publishes the events with core's `core_publish_event()` in the caller's transaction, so they
 * land on each ticket's Activity tab exactly when the change commits.
 */
export const publish = (tx: Tx, actor: Actor, events: TicketEvent[]) =>
  publishEvents(
    tx,
    timelineOf(actor),
    events.map(({ ticketId, ...event }) => ({ ...event, entityId: ticketId })),
  );

/** Records the deleted tickets in core's audit log, which outlives their timelines. */
export const auditRemoved = (tx: Tx, actor: Actor, removed: { id: string; name: string }[]) =>
  audit(tx, timelineOf(actor), TICKET_REMOVED, removed);

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
      assignedMemberIds: tickets.assignedMemberIds,
      subscribedUserIds: tickets.subscribedUserIds,
      tagIds: tickets.tagIds,
      propertiesData: tickets.propertiesData,
      branchId: tickets.branchId,
      departmentId: tickets.departmentId,
      customerId: tickets.customerId,
      companyId: tickets.companyId,
      pipelineId: tickets.pipelineId,
      statusId: tickets.statusId,
      status: pipelineStatuses.name,
    })
    .from(tickets)
    .innerJoin(pipelineStatuses, eq(pipelineStatuses.id, tickets.statusId))
    .where(inArray(tickets.id, ids));

type Snapshot = Awaited<ReturnType<typeof snapshot>>[number];

const pick = (row: Snapshot, fields: readonly string[]) =>
  Object.fromEntries(Object.entries(row).filter(([field]) => fields.includes(field)));

/** A new ticket's entry. */
export const createdEvent = (row: Snapshot): TicketEvent => ({
  ticketId: row.id,
  type: TICKET_EVENTS.created.type,
  summary: `Created ${row.name} in ${row.status}`,
  payload: pick(row, [
    'number',
    'name',
    'priority',
    'assigneeId',
    'pipelineId',
    'statusId',
    'customerId',
    'companyId',
  ]),
  customerId: row.customerId,
  notify: {
    userIds: [row.assigneeId, ...row.assignedMemberIds].filter((id) => id !== null),
    title: `Assigned you ${row.name}`,
  },
});

/** Who hears of a change to the ticket: its followers. */
const followers = (row: Snapshot, title: string) => ({ userIds: row.subscribedUserIds, title });

/** Each ticket's entries for what differs between `before` and `after`. */
export const changeEvents = (before: Snapshot[], after: Snapshot[]): TicketEvent[] => {
  const was = new Map(before.map((row) => [row.id, row]));

  return after.flatMap((now) => {
    const old = was.get(now.id);

    if (!old) return [];

    const fields = FIELDS.filter((field) => !same(old[field], now[field]));

    const added = [now.assigneeId, ...now.assignedMemberIds].filter(
      (id): id is string =>
        id !== null && id !== old.assigneeId && !old.assignedMemberIds.includes(id),
    );

    const moved: TicketEvent = {
      ticketId: now.id,
      type: TICKET_EVENTS.moved.type,
      summary: `Moved from ${old.status} to ${now.status}`,
      customerId: now.customerId,
      notify: followers(now, `${now.name} moved to ${now.status}`),
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
      payload: {
        fromAssigneeId: old.assigneeId,
        toAssigneeId: now.assigneeId,
        fromAssignedMemberIds: old.assignedMemberIds,
        toAssignedMemberIds: now.assignedMemberIds,
      },
      customerId: now.customerId,
      notify: { userIds: added, title: `Assigned you ${now.name}` },
    };

    const changed: TicketEvent = {
      ticketId: now.id,
      type: TICKET_EVENTS.fieldsChanged.type,
      summary: `Changed ${fields.map((field) => FIELD_NAMES[field]).join(', ')}`,
      payload: { fields, before: pick(old, fields), after: pick(now, fields) },
      customerId: now.customerId,
      notify: followers(
        now,
        `Changed ${fields.map((field) => FIELD_NAMES[field]).join(', ')} of ${now.name}`,
      ),
    };

    return [
      ...(old.statusId === now.statusId ? [] : [moved]),
      ...(old.assigneeId === now.assigneeId && same(old.assignedMemberIds, now.assignedMemberIds)
        ? []
        : [assigned]),
      ...(fields.length === 0 ? [] : [changed]),
    ];
  });
};
