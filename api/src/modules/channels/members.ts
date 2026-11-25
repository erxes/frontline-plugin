import { ORPCError } from '@orpc/server';
import { and, asc, desc, eq, inArray, notInArray } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { CHANNEL_EVENTS, PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { CHANNEL_ROLES, channelMembers } from '#/db/schema.ts';
import { reads, writes } from '#/orpc.ts';
import { compileFilter, type FilterFields } from '@erxes/plugin-sdk/filter';
import { FilterInput } from '../filter.ts';
import { channelFor, insertMembers, publishChannelEvents } from './access.ts';

const Members = z.object({ id: z.string(), userIds: z.array(z.string()).min(1).max(500) });
const Member = createSelectSchema(channelMembers).pick({ userId: true, role: true });

/** What the members page's filter bar narrows them by. */
const MEMBER_FILTER: FilterFields = {
  'subject.userId': { type: 'member', expr: channelMembers.userId },
  'subject.role': { type: 'select', expr: channelMembers.role },
  'subject.createdAt': { type: 'date', expr: channelMembers.createdAt },
};

/**
 * A channel's members, admins first, then the newest, narrowed by the filter bar. Names live in
 * core, so the page matches its search against the names it shows.
 */
const members = reads(PERMISSIONS.channelView)
  .route({ summary: "List a channel's members and roles, admins first, then the newest, filtered" })
  .input(z.object({ id: z.string(), filter: FilterInput.filter }))
  .output(
    z.array(createSelectSchema(channelMembers).pick({ userId: true, role: true, createdAt: true })),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.id, { change: false });

    return tx
      .select({
        userId: channelMembers.userId,
        role: channelMembers.role,
        createdAt: channelMembers.createdAt,
      })
      .from(channelMembers)
      .where(
        and(
          eq(channelMembers.channelId, input.id),
          compileFilter(MEMBER_FILTER, input.filter, { me: member.userId }),
        ),
      )
      .orderBy(asc(channelMembers.role), desc(channelMembers.createdAt));
  });

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
  .route({ summary: 'Add team members to a channel you admin; current members keep their role' })
  .input(Members)
  .output(z.array(Member))
  .handler(async ({ input, context: { tx, member } }) => {
    const channel = await channelFor(tx, member, input.id, { change: true });

    if (channel.ownerId)
      throw new ORPCError('FORBIDDEN', { message: 'A personal inbox has only its owner' });

    await insertMembers(tx, member, input.id, input.userIds, 'member');

    return tx
      .select({ userId: channelMembers.userId, role: channelMembers.role })
      .from(channelMembers)
      .where(inChannel(input.id, input.userIds));
  });

/** Removes members, refusing when no admin would be left. */
const removeMembers = writes(PERMISSIONS.channelView)
  .route({ summary: 'Remove members from a channel you admin; refused if no admin would be left' })
  .errors(memberErrors)
  .input(Members)
  .output(z.array(Member.pick({ userId: true })))
  .handler(async ({ input, context: { tx, member }, errors }) => {
    await channelFor(tx, member, input.id, { change: true });

    if (!(await keepsAnAdmin(tx, input.id, input.userIds))) throw errors.LAST_ADMIN();

    const removed = await tx
      .delete(channelMembers)
      .where(inChannel(input.id, input.userIds))
      .returning({ userId: channelMembers.userId });

    if (removed.length > 0)
      await publishChannelEvents(tx, member, [
        {
          entityId: input.id,
          type: CHANNEL_EVENTS.membersRemoved.type,
          summary: removed.length === 1 ? 'Removed a member' : `Removed ${removed.length} members`,
          payload: { channelId: input.id, userIds: removed.map((row) => row.userId) },
        },
      ]);

    return removed;
  });

const setRole = writes(PERMISSIONS.channelView)
  .route({
    summary: 'Make a channel member an admin or a member; refused if no admin would be left',
  })
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

    await publishChannelEvents(tx, member, [
      {
        entityId: input.id,
        type: CHANNEL_EVENTS.roleChanged.type,
        summary: row.role === 'admin' ? 'Made a member an admin' : 'Made an admin a member',
        payload: { channelId: input.id, userId: row.userId, role: row.role },
      },
    ]);

    return row;
  });

export const memberProcedures = { members, addMembers, removeMembers, setRole };
