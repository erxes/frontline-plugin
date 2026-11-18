import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, type Column, eq, inArray, sql } from 'drizzle-orm';
import { PLUGIN } from '#/config.ts';
import { CHANNEL_EVENTS, CHANNEL_TIMELINE, PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { type CHANNEL_ROLES, channelMembers, channels } from '#/db/schema.ts';
import { publishEvents, type RecordEvent } from '../events.ts';

/** Whether `member` sees every channel, not only the ones they belong to. */
export const managesAll = (member: PluginMember) => member.can(PERMISSIONS.channelManage);

/** Whether `member` may see a channel with this owner: a personal inbox shows only to its owner. */
const ownsOrShared = (ownerId: string | null, member: PluginMember) =>
  ownerId === null || ownerId === member.userId;

/** Joins `member`'s own row of `channelMembers` for the channel `channelId` names. */
export const membership = (member: PluginMember, channelId: Column) =>
  and(eq(channelMembers.channelId, channelId), eq(channelMembers.userId, member.userId));

/** Whether `member` may change the channel whose `membership` row the query joined. */
export const canChangeSql = (member: PluginMember) =>
  sql<boolean>`(${channelMembers.role} = 'admin') is true or ${managesAll(member)}`;

/**
 * The channels of `ids` `member` may act on, locked in one statement, in id order, for the rest
 * of the transaction, so concurrent member changes see each other and two changes to the same
 * channels can't deadlock. NOT_FOUND unless they see every one; with `change`, FORBIDDEN unless
 * they are the admin of every one or manage every channel.
 */
export const channelsFor = async (
  tx: Tx,
  member: PluginMember,
  ids: string[],
  { change }: { change: boolean },
) => {
  const distinct = [...new Set(ids)];

  const rows = await tx
    .select({ id: channels.id, role: channelMembers.role, ownerId: channels.ownerId })
    .from(channels)
    .leftJoin(channelMembers, membership(member, channels.id))
    .where(inArray(channels.id, distinct))
    .orderBy(asc(channels.id))
    .for('update', { of: channels });

  if (
    rows.length !== distinct.length ||
    rows.some((row) => (!row.role && !managesAll(member)) || !ownsOrShared(row.ownerId, member))
  )
    throw new ORPCError('NOT_FOUND', { message: 'No such channel' });

  if (change && !managesAll(member) && rows.some((row) => row.role !== 'admin'))
    throw new ORPCError('FORBIDDEN', { message: 'Only a channel admin can change this channel' });

  return rows;
};

/** The one channel of `id` as `channelsFor` holds it. */
export const channelFor = async (
  tx: Tx,
  member: PluginMember,
  id: string,
  options: { change: boolean },
) => {
  const [row] = await channelsFor(tx, member, [id], options);

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such channel' });

  return row;
};

/**
 * `rows`, the records of `ids` a caller read, once their channels are held as `channelsFor`
 * holds them. NOT_FOUND, as no such `noun`, unless `rows` has every one of `ids`.
 */
export const heldInChannels = async <T extends { channelId: string }>(
  tx: Tx,
  member: PluginMember,
  ids: string[],
  rows: T[],
  { change, noun }: { change: boolean; noun: string },
) => {
  if (rows.length !== new Set(ids).size)
    throw new ORPCError('NOT_FOUND', { message: `No such ${noun}` });

  await channelsFor(
    tx,
    member,
    rows.map((row) => row.channelId),
    { change },
  );

  return rows;
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

/** The channels' timeline in core, as `member` changes them. */
export const channelTimeline = (member: PluginMember) => ({
  orgId: member.orgId,
  actorUserId: member.userId,
  entityType: CHANNEL_TIMELINE,
  linkOf: (id: string) => `/${PLUGIN}/settings/channels/${encodeURIComponent(id)}`,
  audited: false,
});

/** Puts the events on the channels' timelines in core. */
export const publishChannelEvents = (tx: Tx, member: PluginMember, events: RecordEvent[]) =>
  publishEvents(tx, channelTimeline(member), events);

/**
 * Records the members added to a channel on its timeline, and tells them, except the one who
 * added them.
 */
const noticeAdded = async (tx: Tx, member: PluginMember, channelId: string, userIds: string[]) => {
  const others = userIds.filter((id) => id !== member.userId);

  if (others.length === 0) return;

  const [channel] = await tx
    .select({ name: channels.name })
    .from(channels)
    .where(eq(channels.id, channelId));

  await publishChannelEvents(tx, member, [
    {
      entityId: channelId,
      type: CHANNEL_EVENTS.membersAdded.type,
      summary: others.length === 1 ? 'Added a member' : `Added ${others.length} members`,
      payload: { channelId, userIds: others },
      notify: { userIds: others, title: `You were added to ${channel?.name ?? 'a channel'}` },
    },
  ]);
};
