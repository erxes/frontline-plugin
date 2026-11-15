import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, type Column, eq, sql } from 'drizzle-orm';
import { PLUGIN } from '#/config.ts';
import { CHANNEL_EVENTS, PERMISSIONS } from '#/core.ts';
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

  const added = await tx
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
    .onConflictDoNothing()
    .returning({ userId: channelMembers.userId });

  await noticeAdded(
    tx,
    member,
    channelId,
    added.map((row) => row.userId),
  );
};

/** Tells the members added to a channel, except the one who added them. */
const noticeAdded = async (tx: Tx, member: PluginMember, channelId: string, userIds: string[]) => {
  const others = userIds.filter((id) => id !== member.userId);

  if (others.length === 0) return;

  const [channel] = await tx
    .select({ name: channels.name })
    .from(channels)
    .where(eq(channels.id, channelId));

  const link = `/${PLUGIN}/settings/channels/${encodeURIComponent(channelId)}`;
  const title = `You were added to ${channel?.name ?? 'a channel'}`;

  await tx.execute(sql`select core_publish_event(
    p_org_id => ${member.orgId},
    p_source => ${PLUGIN},
    p_type => ${CHANNEL_EVENTS.membersAdded.type},
    p_payload => ${JSON.stringify({ channelId, userIds: others })}::jsonb,
    p_notify => ${JSON.stringify({ userIds: others, title, link })}::jsonb,
    p_summary => ${title},
    p_link => ${link},
    p_actor_user_id => ${member.userId}
  )`);
};
