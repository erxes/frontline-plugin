import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { count, eq, getTableColumns, and, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { pipelines, pipelineStatuses, STATUS_TYPES, tickets } from '#/db/tickets.ts';
import { reads, writes } from '#/orpc.ts';
import { channelFor } from '../channels/access.ts';
import { Blank, Stamps, Title } from '../fields.ts';
import { after, newestFirst, PageInput, pageOf } from '../paging.ts';

const { orgId, ...pipelineColumns } = getTableColumns(pipelines);

const Minutes = z.number().int().positive().max(525_600).optional();

/** The SLA as stored: at most one rule per priority. */
const Sla = z.object({
  enabled: z.boolean(),
  rules: z.array(
    z.object({
      priority: z.number().int().min(0).max(4),
      firstResponseMinutes: Minutes,
      resolutionMinutes: Minutes,
    }),
  ),
  warnBeforeMinutes: Minutes,
});

/** An SLA to save: a rule that keeps no clock is dropped. */
const SlaInput = Sla.refine(
  ({ rules }) => new Set(rules.map((rule) => rule.priority)).size === rules.length,
  'Each priority can have one SLA rule',
).transform((policy) => ({
  ...policy,
  rules: policy.rules.filter(
    (rule) => rule.firstResponseMinutes !== undefined || rule.resolutionMinutes !== undefined,
  ),
}));

const Fields = z
  .object({
    name: Title,
    description: Blank(1000),
    numberConfig: Blank(100),
    numberSize: z.number().int().min(1).max(8).nullable(),
    nameConfig: Blank(200),
    slaPolicy: SlaInput.nullable(),
  })
  .partial();

const Pipeline = z.object({
  id: z.string(),
  channelId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  numberConfig: z.string().nullable(),
  numberSize: z.number().nullable(),
  nameConfig: z.string().nullable(),
  slaPolicy: Sla.nullable(),
  ...Stamps,
});

/** CONFLICT when a ticket matches `used`: deleting what it points to would orphan it. */
export const refuseUsed = async (tx: Tx, used: SQL | undefined, message: string) => {
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

/** A channel's pipelines, newest first, `limit` at a time, and how many it has. */
const list = reads(PERMISSIONS.channelView)
  .input(z.object({ channelId: z.string(), ...PageInput }))
  .output(
    z.object({
      pipelines: z.array(Pipeline),
      nextCursor: z.string().nullable(),
      totalCount: z.number(),
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.channelId, { change: false });

    const matches = eq(pipelines.channelId, input.channelId);

    const rows = await tx
      .select(pipelineColumns)
      .from(pipelines)
      .where(and(matches, after(pipelines, input.cursor)))
      .orderBy(...newestFirst(pipelines))
      .limit(input.limit + 1);

    const [total] = await tx.select({ value: count() }).from(pipelines).where(matches);
    const { items, nextCursor } = pageOf(rows, input.limit);

    return { pipelines: items, nextCursor, totalCount: total?.value ?? 0 };
  });

/** One pipeline. */
const get = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Pipeline)
  .handler(({ input, context: { tx, member } }) =>
    pipelineFor(tx, member, input.id, { change: false }),
  );

/** A new pipeline in a channel the caller is an admin of, with one status per stage. */
const create = writes(PERMISSIONS.channelView)
  .input(z.object({ channelId: z.string(), name: Title, description: Blank(1000).optional() }))
  .output(Pipeline)
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.channelId, { change: true });

    const [created] = await tx
      .insert(pipelines)
      .values({ ...input, orgId: member.orgId, createdBy: member.userId })
      .returning(pipelineColumns);

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await tx.insert(pipelineStatuses).values(
      DEFAULT_STATUSES.map((status) => ({
        ...status,
        orgId: member.orgId,
        pipelineId: created.id,
        order: 0,
      })),
    );

    return created;
  });

/** Changes what is given, or moves the pipeline to another channel the caller is an admin of. */
const update = writes(PERMISSIONS.channelView)
  .input(Fields.extend({ id: z.string(), channelId: z.string().optional() }))
  .output(Pipeline)
  .handler(async ({ input: { id, ...fields }, context: { tx, member } }) => {
    const pipeline = await pipelineFor(tx, member, id, { change: true });

    if (fields.channelId && fields.channelId !== pipeline.channelId)
      await channelFor(tx, member, fields.channelId, { change: true });

    const [updated] = await tx
      .update(pipelines)
      .set(fields)
      .where(eq(pipelines.id, id))
      .returning(pipelineColumns);

    if (!updated) throw new ORPCError('NOT_FOUND', { message: 'No such pipeline' });

    return updated;
  });

/** Deletes a pipeline and its statuses. CONFLICT while it has tickets. */
const remove = writes(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }))
  .handler(async ({ input, context: { tx, member } }) => {
    await pipelineFor(tx, member, input.id, { change: true });
    await refuseUsed(tx, eq(tickets.pipelineId, input.id), 'This pipeline has tickets');
    await tx.delete(pipelines).where(eq(pipelines.id, input.id));

    return { id: input.id };
  });

export const pipelineProcedures = { list, get, create, update, remove };
