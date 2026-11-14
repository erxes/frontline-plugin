import { ORPCError } from '@orpc/server';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { CHANNEL_ROLES, channelMembers } from '#/db/schema.ts';
import { writes } from '#/orpc.ts';
import { channelFor } from './access.ts';

const Target = z.object({ id: z.string(), userId: z.string() });
const Member = z.object({ userId: z.string(), role: z.enum(CHANNEL_ROLES) });

const memberErrors = {
  LAST_ADMIN: { status: 409, message: 'A channel keeps at least one admin' },
};

const isMember = (channelId: string, userId: string) =>
  and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, userId));

/**
 * Whether the channel keeps an admin besides `userId`. Callers hold the
 * channel's row lock (`channelFor`), so two demotions can't both pass.
 */
const hasOtherAdmin = async (tx: Tx, channelId: string, userId: string) =>
  (await tx.$count(
    channelMembers,
    and(
      eq(channelMembers.channelId, channelId),
      eq(channelMembers.role, 'admin'),
      ne(channelMembers.userId, userId),
    ),
  )) > 0;

/** Adds a core user as a member; adding a current member changes nothing. */
const addMember = writes(PERMISSIONS.channelView)
  .input(Target)
  .output(Member)
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.id, { change: true });
    await tx
      .insert(channelMembers)
      .values({
        orgId: member.orgId,
        channelId: input.id,
        userId: input.userId,
        createdBy: member.userId,
      })
      .onConflictDoNothing();

    const [row] = await tx
      .select({ userId: channelMembers.userId, role: channelMembers.role })
      .from(channelMembers)
      .where(isMember(input.id, input.userId));

    if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return row;
  });

const removeMember = writes(PERMISSIONS.channelView)
  .errors(memberErrors)
  .input(Target)
  .output(z.object({ userId: z.string() }))
  .handler(async ({ input, context: { tx, member }, errors }) => {
    await channelFor(tx, member, input.id, { change: true });

    if (!(await hasOtherAdmin(tx, input.id, input.userId))) throw errors.LAST_ADMIN();

    const [row] = await tx
      .delete(channelMembers)
      .where(isMember(input.id, input.userId))
      .returning({ userId: channelMembers.userId });

    if (!row) throw new ORPCError('NOT_FOUND', { message: 'Not a member of this channel' });

    return row;
  });

const setRole = writes(PERMISSIONS.channelView)
  .errors(memberErrors)
  .input(Target.extend({ role: z.enum(CHANNEL_ROLES) }))
  .output(Member)
  .handler(async ({ input, context: { tx, member }, errors }) => {
    await channelFor(tx, member, input.id, { change: true });

    if (input.role !== 'admin' && !(await hasOtherAdmin(tx, input.id, input.userId)))
      throw errors.LAST_ADMIN();

    const [row] = await tx
      .update(channelMembers)
      .set({ role: input.role })
      .where(isMember(input.id, input.userId))
      .returning({ userId: channelMembers.userId, role: channelMembers.role });

    if (!row) throw new ORPCError('NOT_FOUND', { message: 'Not a member of this channel' });

    return row;
  });

export const memberProcedures = { addMember, removeMember, setRole };
