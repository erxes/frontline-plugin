import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, eq, getTableColumns, inArray, type SQLWrapper, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '#/db/client.ts';
import { pipelineStatuses, pipelines, STATUS_TYPES, TICKET_STATES, tickets } from '#/db/tickets.ts';
import { channelFor } from '../channels/access.ts';
import { Attachment, Stamps } from '../fields.ts';

const { orgId, ...columns } = getTableColumns(tickets);

/** What procedures return: the row without `org_id`, which the caller already knows. */
export const ticketColumns = columns;

/** 0 no priority, 1 minor, 2 medium, 3 high, 4 critical. */
export const Priority = z.number().int().min(0).max(4);

export const State = z.enum(TICKET_STATES);

/** BlockNote blocks as JSON, from erxes-ui's Editor. */
export const Description = z.string().max(100_000);

export const Ticket = z.object({
  id: z.string(),
  channelId: z.string(),
  pipelineId: z.string(),
  statusId: z.string(),
  number: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  priority: z.number(),
  assigneeId: z.string().nullable(),
  startDate: z.date().nullable(),
  targetDate: z.date().nullable(),
  state: State,
  attachments: z.array(Attachment),
  statusChangedAt: z.date(),
  statusChangedBy: z.string().nullable(),
  firstResponseDueAt: z.date().nullable(),
  resolutionDueAt: z.date().nullable(),
  firstRespondedAt: z.date().nullable(),
  resolvedAt: z.date().nullable(),
  ...Stamps,
});

export type TicketRow = z.infer<typeof Ticket>;

/** Up to 100 distinct ticket ids, as a selection sends them. */
export const Ids = z
  .array(z.string())
  .min(1)
  .max(100)
  .transform((ids) => [...new Set(ids)]);

/**
 * The tickets of `ids`, all of them or NOT_FOUND, oldest first. Their channels'
 * members change them; with `remove`, only the channels' admins. Each channel
 * is held once, in id order, so two changes to the same channels can't deadlock.
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
 * The next `count` numbers of the pipeline's tickets, or nulls when it doesn't
 * number them. Holds the pipeline, so tickets made at once get distinct numbers;
 * the sequence goes on from the highest number with today's prefix, so imported
 * tickets keep theirs.
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
 * Brings the tickets' SLA in line with their pipeline, priority and status, in
 * one statement: due times from creation, the first response stamped once a
 * ticket leaves a new status, and the resolution stamped while it is resolved or
 * closed and cleared when it reopens.
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
