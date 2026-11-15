import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import {
  and,
  asc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNotNull,
  or,
  type SQL,
} from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { channelMembers } from '#/db/schema.ts';
import { pipelines, pipelineStatuses, SlaPolicy, STATUS_TYPES, tickets } from '#/db/tickets.ts';
import { reads, writes } from '#/orpc.ts';
import { canChangeSql, channelFor, managesAll, membership } from '../channels/access.ts';
import { Blank, Title } from '../fields.ts';
import { FilterInput, type FilterFields, filterSql, likeText } from '../filter.ts';
import { after, newestFirst, PageInput, pageOf } from '../paging.ts';

const { orgId, ...pipelineColumns } = getTableColumns(pipelines);

/** What a pipeline's fields accept, the SLA checked as its column stores it. */
const refine = {
  name: () => Title,
  description: () => Blank(1000),
  numberConfig: () => Blank(100),
  numberSize: (schema: z.ZodNumber) => schema.min(1).max(8),
  nameConfig: () => Blank(200),
  slaPolicy: () => SlaPolicy,
};

/** The row, and whether the caller may change it, which the query selects. */
const Pipeline = createSelectSchema(pipelines, { slaPolicy: () => SlaPolicy })
  .omit({ orgId: true })
  .extend({
    /** Whether the caller may edit, move and delete it: its channel's admins may. */
    canManage: z.boolean(),
  });

/** CONFLICT when a ticket matches `used`: deleting what it points to would orphan it. */
export const refuseUsed = async (tx: Tx, used: SQL, message: string) => {
  const [ticket] = await tx.select({ id: tickets.id }).from(tickets).where(used).limit(1);

  if (ticket)
    throw new ORPCError('CONFLICT', { message: `${message}. Move or delete them first.` });
};

/** What a new pipeline starts with: one status per stage. */
const DEFAULT_STATUSES = [
  { type: STATUS_TYPES.new, name: 'New', color: '#3B82F6' },
  { type: STATUS_TYPES.open, name: 'Open', color: '#F59E0B' },
  { type: STATUS_TYPES.inProgress, name: 'In progress', color: '#FBBF24' },
  { type: STATUS_TYPES.resolved, name: 'Resolved', color: '#10B981' },
  { type: STATUS_TYPES.closed, name: 'Closed', color: '#6B7280' },
  { type: STATUS_TYPES.cancelled, name: 'Cancelled', color: '#EF4444' },
];

/**
 * The pipeline `member` may act on: its channel's members read it, the
 * channel's admins and members who manage every channel change it.
 */
export const pipelineFor = async (
  tx: Tx,
  member: PluginMember,
  id: string,
  { change }: { change: boolean },
) => {
  const [pipeline] = await tx.select(pipelineColumns).from(pipelines).where(eq(pipelines.id, id));

  if (!pipeline) throw new ORPCError('NOT_FOUND', { message: 'No such pipeline' });

  await channelFor(tx, member, pipeline.channelId, { change });

  return pipeline;
};

/** Pipelines with whether the caller may change each. Callers check the channel first. */
const pipelineRows = (tx: Tx, member: PluginMember) =>
  tx
    .select({ ...pipelineColumns, canManage: canChangeSql(member) })
    .from(pipelines)
    .leftJoin(channelMembers, membership(member, pipelines.channelId))
    .$dynamic();

const pipelineById = async (tx: Tx, member: PluginMember, id: string) => {
  const [row] = await pipelineRows(tx, member).where(eq(pipelines.id, id));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such pipeline' });

  return row;
};

/** What the list's filter bar narrows pipelines by (`ui/src/modules/pipelines/PipelinesPage.tsx`). */
const PIPELINE_FILTER: FilterFields = {
  'subject.name': { kind: 'text', expr: pipelines.name },
  'subject.description': { kind: 'text', expr: pipelines.description },
  'subject.createdBy': { kind: 'member', expr: pipelines.createdBy },
  'subject.createdAt': { kind: 'date', expr: pipelines.createdAt },
  'subject.updatedAt': { kind: 'date', expr: pipelines.updatedAt },
};

/**
 * A channel's pipelines, newest first, `limit` at a time, narrowed by the filter bar, and how
 * many match: `search` matches the name or description, ignoring case.
 */
const list = reads(PERMISSIONS.channelView)
  .input(z.object({ channelId: z.string(), ...PageInput, ...FilterInput }))
  .output(
    z.object({
      pipelines: z.array(Pipeline),
      nextCursor: z.string().nullable(),
      totalCount: z.number(),
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.channelId, { change: false });

    const matches = and(
      eq(pipelines.channelId, input.channelId),
      input.search
        ? or(
            ilike(pipelines.name, likeText(input.search)),
            ilike(pipelines.description, likeText(input.search)),
          )
        : undefined,
      input.filter ? filterSql(PIPELINE_FILTER, input.filter, member.userId) : undefined,
    );

    const rows = await pipelineRows(tx, member)
      .where(and(matches, after(pipelines, input.cursor)))
      .orderBy(...newestFirst(pipelines))
      .limit(input.limit + 1);

    const { items, nextCursor } = pageOf(rows, input.limit);

    return { pipelines: items, nextCursor, totalCount: await tx.$count(pipelines, matches) };
  });

/** One pipeline. */
const get = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Pipeline)
  .handler(async ({ input, context: { tx, member } }) => {
    await pipelineFor(tx, member, input.id, { change: false });

    return pipelineById(tx, member, input.id);
  });

/** A new pipeline in a channel the caller is an admin of, with one status per stage. */
const create = writes(PERMISSIONS.channelView)
  .input(
    createInsertSchema(pipelines, refine)
      .pick({ channelId: true, name: true, description: true })
      .partial({ description: true }),
  )
  .output(Pipeline)
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.channelId, { change: true });

    const [created] = await tx
      .insert(pipelines)
      .values({ ...input, orgId: member.orgId, createdBy: member.userId })
      .returning({ id: pipelines.id });

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await tx.insert(pipelineStatuses).values(
      DEFAULT_STATUSES.map((status) => ({
        ...status,
        orgId: member.orgId,
        pipelineId: created.id,
        order: 0,
      })),
    );

    return pipelineById(tx, member, created.id);
  });

/** Changes what is given, or moves the pipeline to another channel the caller is an admin of. */
const update = writes(PERMISSIONS.channelView)
  .input(
    createUpdateSchema(pipelines, refine)
      .pick({
        channelId: true,
        name: true,
        description: true,
        numberConfig: true,
        numberSize: true,
        nameConfig: true,
        slaPolicy: true,
      })
      .extend({ id: z.string() }),
  )
  .output(Pipeline)
  .handler(async ({ input: { id, ...fields }, context: { tx, member } }) => {
    const pipeline = await pipelineFor(tx, member, id, { change: true });

    if (fields.channelId && fields.channelId !== pipeline.channelId)
      await channelFor(tx, member, fields.channelId, { change: true });

    await tx.update(pipelines).set(fields).where(eq(pipelines.id, id));

    return pipelineById(tx, member, id);
  });

/**
 * Deletes pipelines and their statuses: all of them, or none when the caller may not delete one.
 * CONFLICT while one has tickets.
 */
const remove = writes(PERMISSIONS.channelView)
  .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    await Promise.all(input.ids.map((id) => pipelineFor(tx, member, id, { change: true })));
    await refuseUsed(
      tx,
      inArray(tickets.pipelineId, input.ids),
      'A pipeline you picked has tickets',
    );

    const removed = await tx
      .delete(pipelines)
      .where(inArray(pipelines.id, input.ids))
      .returning({ id: pipelines.id });

    return { ids: removed.map((row) => row.id) };
  });

const Choice = createSelectSchema(pipelines).pick({ id: true, channelId: true, name: true });

const StatusChoice = createSelectSchema(pipelineStatuses).pick({
  id: true,
  pipelineId: true,
  name: true,
  color: true,
  type: true,
});

/**
 * Every pipeline of the channels the caller sees, by name, and their statuses by stage and
 * order: what a ticket is filed under, for the ticket screens' pickers and filters.
 */
const choices = reads(PERMISSIONS.channelView)
  .output(z.object({ pipelines: z.array(Choice), statuses: z.array(StatusChoice) }))
  .handler(async ({ context: { tx, member } }) => {
    const seen = managesAll(member) ? undefined : isNotNull(channelMembers.userId);

    const pipelineList = await tx
      .select({ id: pipelines.id, channelId: pipelines.channelId, name: pipelines.name })
      .from(pipelines)
      .leftJoin(channelMembers, membership(member, pipelines.channelId))
      .where(seen)
      .orderBy(asc(pipelines.name), asc(pipelines.id));

    const statuses = await tx
      .select({
        id: pipelineStatuses.id,
        pipelineId: pipelineStatuses.pipelineId,
        name: pipelineStatuses.name,
        color: pipelineStatuses.color,
        type: pipelineStatuses.type,
      })
      .from(pipelineStatuses)
      .innerJoin(pipelines, eq(pipelines.id, pipelineStatuses.pipelineId))
      .leftJoin(channelMembers, membership(member, pipelines.channelId))
      .where(seen)
      .orderBy(
        asc(pipelineStatuses.type),
        asc(pipelineStatuses.order),
        asc(pipelineStatuses.createdAt),
      );

    return { pipelines: pipelineList, statuses };
  });

export const pipelineProcedures = { list, get, create, update, remove, choices };
