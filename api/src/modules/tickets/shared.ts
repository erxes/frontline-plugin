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
  type SQLWrapper,
  sql,
} from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import type { Tx } from '#/db/client.ts';
import { channelMembers } from '#/db/schema.ts';
import { Attachment } from '#/db/table.ts';
import { pipelineStatuses, pipelines, STATUS_TYPES, tickets } from '#/db/tickets.ts';
import { canChangeSql, channelFor, managesAll, membership } from '../channels/access.ts';
import { Title } from '../fields.ts';

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
export const Ticket = createSelectSchema(tickets, { attachments: () => z.array(Attachment) })
  .omit({ orgId: true })
  .extend({
    /** Whether the caller may delete it: its channel's admins may. */
    canManage: z.boolean(),
    firstResponseSla: SlaState,
    resolutionSla: SlaState,
  });

/** The tickets `member` sees: their channels', or every channel's for one who manages them all. */
export const seenBy = (member: PluginMember) =>
  managesAll(member) ? undefined : isNotNull(channelMembers.userId);

/** Tickets with what the caller may do and their SLA states. Callers narrow them with `seenBy`. */
export const ticketRows = (tx: Tx, member: PluginMember) =>
  tx
    .select({
      ...ticketColumns,
      canManage: canChangeSql(member),
      firstResponseSla,
      resolutionSla,
    })
    .from(tickets)
    .leftJoin(channelMembers, membership(member, tickets.channelId))
    .$dynamic();

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
};

/** Up to 100 distinct ticket ids, as a selection sends them. */
export const Ids = z
  .array(z.string())
  .min(1)
  .max(100)
  .transform((ids) => [...new Set(ids)]);

/**
 * The tickets of `ids`, all of them or NOT_FOUND, oldest first. Their channels' members change
 * them; with `remove`, only the channels' admins. Each channel is held once, in id order, so two
 * changes to the same channels can't deadlock.
 */
export const ticketsFor = async (
  tx: Tx,
  member: PluginMember,
  ids: string[],
  { remove = false } = {},
) => {
  const rows = await tx
    .select(ticketColumns)
    .from(tickets)
    .where(inArray(tickets.id, ids))
    .orderBy(asc(tickets.createdAt), asc(tickets.id));

  if (rows.length !== ids.length) throw new ORPCError('NOT_FOUND', { message: 'No such ticket' });

  const channelIds = [...new Set(rows.map((row) => row.channelId))].toSorted();

  // One connection runs the locks in the order they are sent.
  await Promise.all(
    channelIds.map((channelId) => channelFor(tx, member, channelId, { change: remove })),
  );

  return rows;
};

/** A number's prefix on `day`: the pipeline's format with `{year}`, `{month}` and `{day}` filled in. */
const prefixOf = (config: string, day: Date) =>
  config
    .replaceAll('{year}', String(day.getUTCFullYear()))
    .replaceAll('{month}', String(day.getUTCMonth() + 1).padStart(2, '0'))
    .replaceAll('{day}', String(day.getUTCDate()).padStart(2, '0'));

/**
 * The next `count` numbers of the pipeline's tickets, or nulls when it doesn't number them.
 * Holds the pipeline, so tickets made at once get distinct numbers; the sequence goes on from
 * the highest number with today's prefix, so imported tickets keep theirs.
 */
export const nextNumbers = async (tx: Tx, pipelineId: string, count: number) => {
  const [pipeline] = await tx
    .select({ numberConfig: pipelines.numberConfig, numberSize: pipelines.numberSize })
    .from(pipelines)
    .where(eq(pipelines.id, pipelineId))
    .for('update');

  const size = pipeline?.numberSize;

  if (!size) return Array.from({ length: count }, () => null);

  const prefix = prefixOf(pipeline.numberConfig ?? '', new Date());
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

  const start = last?.value == null ? 0 : Number(last.value) + 1;

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

/**
 * Brings the tickets' SLA in line with their pipeline, priority and status, in one statement:
 * due times from creation, the first response stamped once a ticket leaves a new status, and the
 * resolution stamped while it is resolved or closed and cleared when it reopens.
 */
export const refreshSla = (tx: Tx, ids: string[]) =>
  tx
    .update(tickets)
    .set({
      firstResponseDueAt: dueOf('firstResponseMinutes'),
      resolutionDueAt: dueOf('resolutionMinutes'),
      firstRespondedAt: sql`case when ${stage} > ${STATUS_TYPES.new}
        then coalesce(${tickets.firstRespondedAt}, now()) else ${tickets.firstRespondedAt} end`,
      resolvedAt: sql`case when ${stage} in (${closing})
        then coalesce(${tickets.resolvedAt}, now()) end`,
    })
    .from(pipelines)
    .where(and(eq(pipelines.id, tickets.pipelineId), inArray(tickets.id, ids)));

/** Tells the organisation's open ticket screens to refetch, once the change commits. */
export const signalTickets = (tx: Tx, member: PluginMember) =>
  tx.execute(sql`select core_live_signal(${member.orgId}, 'frontline', 'tickets')`);
