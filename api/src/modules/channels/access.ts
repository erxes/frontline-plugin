import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, type Column, eq, sql } from 'drizzle-orm';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { type CHANNEL_ROLES, channelMembers, channels } from '#/db/schema.ts';

/** Whether `member` sees every channel, not only the ones they belong to. */
export const managesAll = (member: PluginMember) => member.can(PERMISSIONS.channelManage);

/** Joins `member`'s own row of `channelMembers` for the channel `channelId` names. */
export const membership = (member: PluginMember, channelId: Column) =>
  and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, member.userId));

/** Whether `member` may change the channel whose `membership` row the query joined. */
export const canChangeSql = (member: PluginMember) =>
  sql<boolean>`(${channelMembers.role} = 'admin') is true or ${managesAll(member)}`;

/**
 * The channel `member` may act on, locked for the rest of the transaction so
 * concurrent member changes see each other. NOT_FOUND unless they see it;
 * with `change`, FORBIDDEN unless they are its admin or manage every channel.
 */
export const channelFor = async (
  tx: Tx,
  member: PluginMember,
  id: string,
  { change }: { change: boolean },
) => {
  const [row] = await tx
    .select({ role: channelMembers.role })
    .from(channels)
    .leftJoin(channelMembers, membership(member, channels.id))
    .where(eq(channels.id, id))
    .for('update', { of: channels });

  if (!row || (!row.role && !managesAll(member)))
    throw new ORPCError('NOT_FOUND', { message: 'No such channel' });

  if (change && row.role !== 'admin' && !managesAll(member))
    throw new ORPCError('FORBIDDEN', { message: 'Only a channel admin can change this channel' });

  return row;
};

/** Adds core users to a channel with `role`; a user already in it keeps their role. */
export const insertMembers = async (
  tx: Tx,
  member: PluginMember,
  channelId: string,
  userIds: string[],
  role: (typeof CHANNEL_ROLES)[number],
) => {
  if (userIds.length === 0) return;

  await tx
    .insert(channelMembers)
    .values(
      [...new Set(userIds)].map((userId) => ({
        orgId: member.orgId,
        channelId,
        userId,
        role,
        createdBy: member.userId,
      })),
    )
    .onConflictDoNothing();
};
