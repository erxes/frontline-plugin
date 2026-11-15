import { ORPCError } from '@orpc/server';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { CHANNEL_ROLES, channelMembers } from '#/db/schema.ts';
import { writes } from '#/orpc.ts';
import { channelFor, insertMembers } from './access.ts';

const Members = z.object({ id: z.string(), userIds: z.array(z.string()).min(1).max(500) });
const Member = z.object({ userId: z.string(), role: z.enum(CHANNEL_ROLES) });

const memberErrors = {
  LAST_ADMIN: { status: 409, message: 'A channel keeps at least one admin' },
};

const inChannel = (channelId: string, userIds: string[]) =>
  and(eq(channelMembers.channelId, channelId), inArray(channelMembers.userId, userIds));

/**
 * Whether the channel keeps an admin besides `userIds`. Callers hold the
 * channel's row lock (`channelFor`), so two demotions can't both pass.
 */
const keepsAnAdmin = async (tx: Tx, channelId: string, userIds: string[]) =>
  (await tx.$count(
    channelMembers,
    and(
      eq(channelMembers.channelId, channelId),
      eq(channelMembers.role, 'admin'),
      notInArray(channelMembers.userId, userIds),
    ),
  )) > 0;

/** Adds core users as members; a current member keeps their role. */
const addMembers = writes(PERMISSIONS.channelView)
  .input(Members)
  .output(z.array(Member))
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.id, { change: true });
    await insertMembers(tx, member, input.id, input.userIds, 'member');

    return tx
      .select({ userId: channelMembers.userId, role: channelMembers.role })
      .from(channelMembers)
      .where(inChannel(input.id, input.userIds));
  });

/** Removes members, refusing when no admin would be left. */
const removeMembers = writes(PERMISSIONS.channelView)
  .errors(memberErrors)
  .input(Members)
  .output(z.array(z.object({ userId: z.string() })))
  .handler(async ({ input, context: { tx, member }, errors }) => {
    await channelFor(tx, member, input.id, { change: true });

    if (!(await keepsAnAdmin(tx, input.id, input.userIds))) throw errors.LAST_ADMIN();

    return tx
      .delete(channelMembers)
      .where(inChannel(input.id, input.userIds))
      .returning({ userId: channelMembers.userId });
  });

const setRole = writes(PERMISSIONS.channelView)
  .errors(memberErrors)
  .input(z.object({ id: z.string(), userId: z.string(), role: z.enum(CHANNEL_ROLES) }))
  .output(Member)
  .handler(async ({ input, context: { tx, member }, errors }) => {
    await channelFor(tx, member, input.id, { change: true });

    if (input.role !== 'admin' && !(await keepsAnAdmin(tx, input.id, [input.userId])))
      throw errors.LAST_ADMIN();

    const [row] = await tx
      .update(channelMembers)
      .set({ role: input.role })
      .where(inChannel(input.id, [input.userId]))
      .returning({ userId: channelMembers.userId, role: channelMembers.role });

    if (!row) throw new ORPCError('NOT_FOUND', { message: 'Not a member of this channel' });

    return row;
  });

export const memberProcedures = { addMembers, removeMembers, setRole };
