import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, eq, getTableColumns } from 'drizzle-orm';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { type CHANNEL_ROLES, channelMembers, channels } from '#/db/schema.ts';

const { orgId, ...columns } = getTableColumns(channels);

/** What a procedure returns: the row without `org_id`, which the caller already knows. */
export const channelColumns = columns;

/** Whether `member` sees every channel, not only the ones they belong to. */
export const managesAll = (member: PluginMember) => member.can(PERMISSIONS.channelManage);

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
    .select({ channel: channelColumns, role: channelMembers.role })
    .from(channels)
    .leftJoin(
      channelMembers,
      and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, member.userId)),
    )
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
