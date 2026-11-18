import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, count, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { pipelineStatuses, pipelines, tickets } from '#/db/tickets.ts';
import { reads, writes } from '#/orpc.ts';
import { heldInChannels } from '../channels/access.ts';
import { Blank, Color, Title } from '../fields.ts';
import { pipelineFor, refuseUsed, UserIds } from './pipelines.ts';

const { orgId, ...statusColumns } = getTableColumns(pipelineStatuses);

/** The stage, 1 new to 6 cancelled (`STATUS_TYPES`). */
const Type = z.number().int().min(1).max(6);

/** What a status's fields accept. */
const refine = {
  type: () => Type,
  name: () => Title,
  description: () => Blank(255),
  color: () => Color,
  memberIds: () => UserIds,
  canEditMemberIds: () => UserIds,
  canMoveMemberIds: () => UserIds,
};

const Status = createSelectSchema(pipelineStatuses).omit({ orgId: true });

/** The status `member` may act on, under the rules of its pipeline. */
const statusFor = async (
  tx: Tx,
  member: PluginMember,
  id: string,
  { change }: { change: boolean },
) => {
  const [status] = await tx
    .select(statusColumns)
    .from(pipelineStatuses)
    .where(eq(pipelineStatuses.id, id));

  if (!status) throw new ORPCError('NOT_FOUND', { message: 'No such status' });

  await pipelineFor(tx, member, status.pipelineId, { change });

  return status;
};

/** A pipeline's statuses, by stage, each stage's in its order. */
const list = reads(PERMISSIONS.channelView)
  .input(z.object({ pipelineId: z.string() }))
  .output(z.array(Status))
  .handler(async ({ input, context: { tx, member } }) => {
    await pipelineFor(tx, member, input.pipelineId, { change: false });

    return tx
      .select(statusColumns)
      .from(pipelineStatuses)
      .where(eq(pipelineStatuses.pipelineId, input.pipelineId))
      .orderBy(
        asc(pipelineStatuses.type),
        asc(pipelineStatuses.order),
        asc(pipelineStatuses.createdAt),
      );
  });

/**
 * A new status, last in its stage. Changing a pipeline holds its channel, so
 * two statuses added at once can't take the same place.
 */
const create = writes(PERMISSIONS.channelView)
  .input(
    createInsertSchema(pipelineStatuses, refine)
      .pick({ pipelineId: true, type: true, name: true, description: true, color: true })
      .partial({ description: true, color: true }),
  )
  .output(Status)
  .handler(async ({ input, context: { tx, member } }) => {
    await pipelineFor(tx, member, input.pipelineId, { change: true });

    const [created] = await tx
      .insert(pipelineStatuses)
      .values({
        ...input,
        orgId: member.orgId,
        order: sql`(
          select coalesce(max("order") + 1, 0) from ${pipelineStatuses}
          where pipeline_id = ${input.pipelineId} and type = ${input.type}
        )`,
      })
      .returning(statusColumns);

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return created;
  });

/** Renames a status, or changes its description or colour. */
const update = writes(PERMISSIONS.channelView)
  .input(
    createUpdateSchema(pipelineStatuses, refine)
      .pick({
        name: true,
        description: true,
        color: true,
        visibilityType: true,
        memberIds: true,
        canEditMemberIds: true,
        canMoveMemberIds: true,
      })
      .extend({ id: z.string() }),
  )
  .output(Status)
  .handler(async ({ input: { id, ...fields }, context: { tx, member } }) => {
    await statusFor(tx, member, id, { change: true });

    const [updated] = await tx
      .update(pipelineStatuses)
      .set(fields)
      .where(eq(pipelineStatuses.id, id))
      .returning(statusColumns);

    if (!updated) throw new ORPCError('NOT_FOUND', { message: 'No such status' });

    return updated;
  });

/**
 * Puts a stage's statuses in the order of `ids`, which lists every one of them,
 * in one statement. CONFLICT when the stage changed since the caller read it.
 */
const reorder = writes(PERMISSIONS.channelView)
  .input(
    z.object({
      pipelineId: z.string(),
      type: Type,
      ids: z
        .array(z.string())
        .min(1)
        .max(100)
        .refine((ids) => new Set(ids).size === ids.length, 'Each status once'),
    }),
  )
  .output(z.array(Status))
  .handler(async ({ input, context: { tx, member } }) => {
    await pipelineFor(tx, member, input.pipelineId, { change: true });

    const inStage = and(
      eq(pipelineStatuses.pipelineId, input.pipelineId),
      eq(pipelineStatuses.type, input.type),
    );

    const [stage] = await tx.select({ value: count() }).from(pipelineStatuses).where(inStage);

    const moved = await tx
      .update(pipelineStatuses)
      .set({
        order: sql`array_position(${sql.param(input.ids)}::text[], ${pipelineStatuses.id}) - 1`,
      })
      .where(and(inStage, inArray(pipelineStatuses.id, input.ids)))
      .returning(statusColumns);

    if (moved.length !== input.ids.length || stage?.value !== input.ids.length)
      throw new ORPCError('CONFLICT', {
        message: 'The statuses changed while you moved them. Reload and try again.',
      });

    return moved.toSorted((a, b) => a.order - b.order);
  });

/**
 * Deletes statuses: all of them, or none when the caller may not delete one. CONFLICT while
 * tickets are in one.
 */
const remove = writes(PERMISSIONS.channelView)
  .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    await heldInChannels(
      tx,
      member,
      input.ids,
      await tx
        .select({ channelId: pipelines.channelId })
        .from(pipelineStatuses)
        .innerJoin(pipelines, eq(pipelines.id, pipelineStatuses.pipelineId))
        .where(inArray(pipelineStatuses.id, input.ids)),
      { change: true, noun: 'status' },
    );
    await refuseUsed(tx, inArray(tickets.statusId, input.ids), 'A status you picked has tickets');

    const removed = await tx
      .delete(pipelineStatuses)
      .where(inArray(pipelineStatuses.id, input.ids))
      .returning({ id: pipelineStatuses.id });

    return { ids: removed.map((row) => row.id) };
  });

export const statusProcedures = { list, create, update, reorder, remove };
