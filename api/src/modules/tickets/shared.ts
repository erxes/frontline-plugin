import { CustomFields } from '@erxes/core-contract';
import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import {
  and,
  asc,
  type Column,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  type SQL,
  type SQLWrapper,
  sql,
} from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import type { Tx } from '#/db/client.ts';
import { channelMembers } from '#/db/schema.ts';
import { Attachment, StoredFile } from '#/db/table.ts';
import { pipelineStatuses, pipelines, STATUS_TYPES, tickets } from '#/db/tickets.ts';
import { canChangeSql, heldInChannels, managesAll, membership } from '../channels/access.ts';
import { Title } from '../fields.ts';
import { notifyVisitors } from '../inbox/shared.ts';
import { statusRights, ticketVisible } from '../pipelines/rights.ts';

/** The row without `org_id`, which the caller already knows. */
const { orgId, ...ticketColumns } = getTableColumns(tickets);

/**
 * Where a ticket stands on one SLA clock: `due` before its time, `overdue` after it, `met` or
 * `missed` once the clock stopped. Null when its pipeline keeps no such clock.
 */
export const SLA_STATES = ['due', 'overdue', 'met', 'missed'] as const;

const slaState = (due: Column, done: Column) =>
  sql<(typeof SLA_STATES)[number] | null>`case
    when ${due} is null then null
    when ${done} is not null then case when ${done} <= ${due} then 'met' else 'missed' end
    when now() > ${due} then 'overdue'
    else 'due'
  end`;

export const firstResponseSla = slaState(tickets.firstResponseDueAt, tickets.firstRespondedAt);

export const resolutionSla = slaState(tickets.resolutionDueAt, tickets.resolvedAt);

const SlaState = z.enum(SLA_STATES).nullable();

/** The row, what the caller may do with it and its SLA, which the query selects. */
export const Ticket = createSelectSchema(tickets, {
  attachments: () => z.array(StoredFile),
  propertiesData: () => CustomFields,
})
  .omit({ orgId: true })
  .extend({
    /** Whether the caller may delete it: its channel's admins may. */
    canManage: z.boolean(),
    /** Whether the caller may change its fields, and move it, by its status's lists. */
    canEdit: z.boolean(),
    canMove: z.boolean(),
    firstResponseSla: SlaState,
    resolutionSla: SlaState,
  });

/**
 * A ticket as lists, boards and tables show it: without the description and attachments, which
 * only its panel shows. The board's cards show its property values.
 */
export const TicketRow = Ticket.omit({ description: true, attachments: true });

const { description, attachments, ...rowColumns } = ticketColumns;

/**
 * The tickets `member` sees: their channels', or every channel's for one who manages them all,
 * under their statuses' and pipelines' rules (`ticketVisible`).
 */
export const seenBy = (member: PluginMember) =>
  and(managesAll(member) ? undefined : isNotNull(channelMembers.userId), ticketVisible(member));

/** Tickets' `columns` with what the caller may do and their SLA states. */
const rowsOf = <Columns extends typeof rowColumns>(
  tx: Tx,
  member: PluginMember,
  columns: Columns,
) => {
  const rights = statusRights(member);

  return tx
    .select({
      ...columns,
      canManage: canChangeSql(member),
      canEdit: rights.canEdit,
      canMove: rights.canMove,
      firstResponseSla,
      resolutionSla,
    })
    .from(tickets)
    .innerJoin(pipelineStatuses, eq(pipelineStatuses.id, tickets.statusId))
    .leftJoin(channelMembers, membership(member, tickets.channelId))
    .$dynamic();
};

/** Tickets as `Ticket`. Callers narrow them with `seenBy`. */
const ticketRows = (tx: Tx, member: PluginMember) => rowsOf(tx, member, ticketColumns);

/** Tickets as `TicketRow`, for lists. Callers narrow them with `seenBy`. */
export const listRows = (tx: Tx, member: PluginMember) => rowsOf(tx, member, rowColumns);

/** The tickets of `ids` as the caller sees them, oldest first. */
export const ticketsById = (tx: Tx, member: PluginMember, ids: string[]) =>
  ticketRows(tx, member)
    .where(inArray(tickets.id, ids))
    .orderBy(asc(tickets.createdAt), asc(tickets.id));

/** One ticket the caller just wrote, as they see it. */
export const ticketById = async (tx: Tx, member: PluginMember, id: string) => {
  const [ticket] = await ticketsById(tx, member, [id]);

  if (!ticket) throw new ORPCError('NOT_FOUND', { message: 'No such ticket' });

  return ticket;
};

/** What a ticket's fields accept. */
export const refine = {
  name: () => Title,
  /** BlockNote blocks as JSON, from erxes-ui's Editor. */
  description: (schema: z.ZodString) => schema.max(100_000),
  /** 0 no priority, 1 minor, 2 medium, 3 high, 4 critical. */
  priority: (schema: z.ZodNumber) => schema.min(0).max(4),
  attachments: () => z.array(Attachment).max(50),
  assignedMemberIds: () => UserIds,
  subscribedUserIds: () => UserIds,
  tagIds: () => z.array(z.string()).max(100),
};

const UserIds = z.array(z.string()).max(100);

/** One ticket `member` sees (`seenBy`), or NOT_FOUND. */
export const seenTicket = async (tx: Tx, member: PluginMember, id: string) => {
  const [ticket] = await ticketRows(tx, member).where(and(eq(tickets.id, id), seenBy(member)));

  if (!ticket) throw new ORPCError('NOT_FOUND', { message: 'No such ticket' });

  return ticket;
};

/**
 * The tickets of `ids` the caller sees (`seenBy`), all of them or NOT_FOUND, oldest first, with
 * their channels held (`heldInChannels`). Their channels' members change them; with `remove`,
 * only the admins.
 */
export const ticketsFor = async (
  tx: Tx,
  member: PluginMember,
  ids: string[],
  { remove = false } = {},
) =>
  heldInChannels(
    tx,
    member,
    ids,
    await tx
      .select(ticketColumns)
      .from(tickets)
      .leftJoin(channelMembers, membership(member, tickets.channelId))
      .where(and(inArray(tickets.id, ids), seenBy(member)))
      .orderBy(asc(tickets.createdAt), asc(tickets.id)),
    { change: remove, noun: 'ticket' },
  );

/** A number's prefix on `day`: the pipeline's format with `{year}`, `{month}` and `{day}` filled in. */
const prefixOf = (config: string, day: Date) =>
  config
    .replaceAll('{year}', String(day.getUTCFullYear()))
    .replaceAll('{month}', String(day.getUTCMonth() + 1).padStart(2, '0'))
    .replaceAll('{day}', String(day.getUTCDate()).padStart(2, '0'));

/** The highest number of the pipeline's tickets with `prefix`, or null when none has one. */
const highestNumber = async (tx: Tx, pipelineId: string, prefix: string) => {
  const tail = sql`substring(${tickets.number} from ${prefix.length + 1}::int)`;

  const [last] = await tx
    .select({ value: sql<string | null>`max(${tail}::bigint)` })
    .from(tickets)
    .where(
      and(
        eq(tickets.pipelineId, pipelineId),
        sql`starts_with(${tickets.number}, ${prefix})`,
        sql`${tail} ~ '^[0-9]{1,15}$'`,
      ),
    );

  return last?.value == null ? null : Number(last.value);
};

/**
 * The next `count` numbers of the pipeline's tickets, or nulls when it doesn't number them.
 * Holds the pipeline, so tickets made at once get distinct numbers, and counts on from its
 * `lastNumber`. A new prefix, such as a new day's, goes on from the highest number its tickets
 * have, so imported tickets keep theirs.
 */
export const nextNumbers = async (tx: Tx, pipelineId: string, count: number) => {
  const [pipeline] = await tx
    .select({
      numberConfig: pipelines.numberConfig,
      numberSize: pipelines.numberSize,
      lastNumber: pipelines.lastNumber,
      lastNumberPrefix: pipelines.lastNumberPrefix,
    })
    .from(pipelines)
    .where(eq(pipelines.id, pipelineId))
    .for('update');

  const size = pipeline?.numberSize;

  if (!size) return Array.from({ length: count }, () => null);

  const prefix = prefixOf(pipeline.numberConfig ?? '', new Date());

  const last =
    pipeline.lastNumberPrefix === prefix
      ? pipeline.lastNumber
      : await highestNumber(tx, pipelineId, prefix);

  const start = last === null ? 0 : last + 1;

  await tx
    .update(pipelines)
    .set({
      lastNumber: start + count - 1,
      lastNumberPrefix: prefix,
      updatedAt: sql`${pipelines.updatedAt}`,
    })
    .where(eq(pipelines.id, pipelineId));

  return Array.from(
    { length: count },
    (_, index) => `${prefix}${String(start + index).padStart(size, '0')}`,
  );
};

/** The first status of a pipeline's `type` stage, by its order. */
export const firstStatusOf = (pipelineId: string, type: SQLWrapper | number) =>
  sql<string | null>`(
    select ${pipelineStatuses.id} from ${pipelineStatuses}
    where ${pipelineStatuses.pipelineId} = ${pipelineId} and ${pipelineStatuses.type} = ${type}
    order by ${pipelineStatuses.order}, ${pipelineStatuses.createdAt} limit 1
  )`;

/** The ticket's due time on one clock: its creation plus the minutes its pipeline's SLA rule gives its priority. */
const dueOf = (clock: 'firstResponseMinutes' | 'resolutionMinutes') =>
  sql`${tickets.createdAt} + (
    select make_interval(mins => (sla_rule ->> ${sql.raw(`'${clock}'`)})::int)
    from jsonb_array_elements(${pipelines.slaPolicy} -> 'rules') as sla_rule
    where (${pipelines.slaPolicy} ->> 'enabled')::boolean
      and (sla_rule ->> 'priority')::int = ${tickets.priority}
  )`;

const stage = sql<number>`(
  select ${pipelineStatuses.type} from ${pipelineStatuses}
  where ${pipelineStatuses.id} = ${tickets.statusId}
)`;

const closing = sql.raw(`${STATUS_TYPES.resolved}, ${STATUS_TYPES.closed}`);

/** A notice's stamp, cleared when its clock's due time moves. */
const unlessMoved = (due: SQL, was: Column, stamp: Column) =>
  sql`case when ${due} is distinct from ${was} then null else ${stamp} end`;

/**
 * Brings the tickets' SLA in line with their pipeline, priority and status, in one statement:
 * due times from creation, the first response stamped once a ticket leaves a new status, and the
 * resolution stamped while it is resolved or closed and cleared when it reopens. A clock whose
 * due time moves may warn and breach again.
 */
export const refreshSla = (tx: Tx, ids: string[]) => {
  const firstResponseDue = dueOf('firstResponseMinutes');
  const resolutionDue = dueOf('resolutionMinutes');

  return tx
    .update(tickets)
    .set({
      firstResponseDueAt: firstResponseDue,
      resolutionDueAt: resolutionDue,
      firstResponseWarnedAt: unlessMoved(
        firstResponseDue,
        tickets.firstResponseDueAt,
        tickets.firstResponseWarnedAt,
      ),
      firstResponseBreachedAt: unlessMoved(
        firstResponseDue,
        tickets.firstResponseDueAt,
        tickets.firstResponseBreachedAt,
      ),
      resolutionWarnedAt: unlessMoved(
        resolutionDue,
        tickets.resolutionDueAt,
        tickets.resolutionWarnedAt,
      ),
      resolutionBreachedAt: unlessMoved(
        resolutionDue,
        tickets.resolutionDueAt,
        tickets.resolutionBreachedAt,
      ),
      firstRespondedAt: sql`case when ${stage} > ${STATUS_TYPES.new}
        then coalesce(${tickets.firstRespondedAt}, now()) else ${tickets.firstRespondedAt} end`,
      resolvedAt: sql`case when ${stage} in (${closing})
        then coalesce(${tickets.resolvedAt}, now()) end`,
    })
    .from(pipelines)
    .where(and(eq(pipelines.id, tickets.pipelineId), inArray(tickets.id, ids)));
};

/**
 * Tells the organisation's open ticket screens to refetch once the change commits, and the
 * customer of each changed ticket, so their messenger's ticket tab refetches too.
 */
export const signalTickets = async (
  tx: Tx,
  actor: { orgId: string },
  changed: { id: string; customerId: string | null }[],
) => {
  await tx.execute(sql`select core_live_signal(${actor.orgId}, 'frontline', 'tickets')`);

  // One event per customer: their tab refetches every ticket, however many changed.
  const byCustomer = new Map(
    changed.flatMap(({ id, customerId }) => (customerId ? [[customerId, id] as const] : [])),
  );

  await notifyVisitors(
    tx,
    actor.orgId,
    [...byCustomer].map(([customerId, id]) => ({ id, customerId })),
    'ticket',
  );
};
