import type { PluginMember } from '@erxes/plugin-sdk';
import { type ORPCErrorConstructorMap, ORPCError } from '@orpc/server';
import { and, asc, desc, eq, ilike, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { type Tx, uniqueViolation } from '#/db/client.ts';
import { CHANNEL_NAME_INDEX, CHANNEL_ROLES, channelMembers, channels } from '#/db/schema.ts';
import { reads, writes } from '#/orpc.ts';
import { channelColumns, channelFor, insertMembers, managesAll } from './access.ts';

const Name = z.string().trim().min(1).max(100);
const Description = z.string().trim().max(1000);
const Icon = z.string().max(100).nullable();
const Role = z.enum(CHANNEL_ROLES);

const Channel = z.object({
  id: z.string(),
  name: Name,
  description: Description,
  icon: Icon,
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  /** Its members' core user ids, admins first. */
  memberIds: z.array(z.string()),
  /** The caller's role, or null when they see it without belonging to it. */
  role: Role.nullable(),
  /** Whether the caller may rename it, delete it and change its members. */
  canManage: z.boolean(),
});

const Member = z.object({ userId: z.string(), role: Role, createdAt: z.date() });

/** The failures a client can branch on: `isDefinedError(error) && error.code === ...`. */
const channelErrors = {
  CHANNEL_NAME_TAKEN: {
    status: 409,
    message: 'Another channel has this name',
    data: z.object({ name: z.string() }),
  },
};

/** The one place Postgres's 23505 on the name index becomes CHANNEL_NAME_TAKEN. */
const nameTaken =
  (errors: ORPCErrorConstructorMap<typeof channelErrors>, name: string) =>
  (error: unknown): never => {
    if (uniqueViolation(error) === CHANNEL_NAME_INDEX)
      throw errors.CHANNEL_NAME_TAKEN({ data: { name } });

    throw error;
  };

const memberIds = sql<string[]>`coalesce((
  select array_agg(listed.user_id order by listed.role, listed.created_at desc)
  from ${channelMembers} listed where listed.channel_id = ${channels.id}
), '{}')`;

/** Channels with their member ids and the caller's role, visible to `member`. */
const channelRows = (tx: Tx, member: PluginMember) =>
  tx
    .select({
      ...channelColumns,
      memberIds,
      role: channelMembers.role,
    })
    .from(channels)
    .leftJoin(
      channelMembers,
      and(eq(channelMembers.channelId, channels.id), eq(channelMembers.userId, member.userId)),
    )
    .$dynamic();

const withAccess =
  (member: PluginMember) =>
  <T extends { role: 'admin' | 'member' | null }>(row: T) => ({
    ...row,
    canManage: row.role === 'admin' || managesAll(member),
  });

/** One channel as the caller sees it. */
const channelById = async (tx: Tx, member: PluginMember, id: string) => {
  const [row] = await channelRows(tx, member).where(eq(channels.id, id));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such channel' });

  return withAccess(member)(row);
};

/** `%` and `_` match themselves in a LIKE pattern built from `text`. */
const likeText = (text: string) => `%${text.replaceAll(/[\\%_]/g, '\\$&')}%`;

/**
 * The caller's channels, or every channel for a member who manages them all,
 * by name; `name` keeps those whose name contains it, ignoring case.
 */
const list = reads(PERMISSIONS.channelView)
  .input(z.object({ name: z.string().trim().max(100).optional() }))
  .output(z.object({ channels: z.array(Channel), canCreate: z.boolean() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const rows = await channelRows(tx, member)
      .where(
        and(
          managesAll(member) ? undefined : isNotNull(channelMembers.userId),
          input.name ? ilike(channels.name, likeText(input.name)) : undefined,
        ),
      )
      .orderBy(asc(sql`lower(${channels.name})`));

    return { channels: rows.map(withAccess(member)), canCreate: managesAll(member) };
  });

/** A channel with its members, admins first. */
const get = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Channel.extend({ members: z.array(Member) }))
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.id, { change: false });

    const members = await tx
      .select({
        userId: channelMembers.userId,
        role: channelMembers.role,
        createdAt: channelMembers.createdAt,
      })
      .from(channelMembers)
      .where(eq(channelMembers.channelId, input.id))
      .orderBy(asc(channelMembers.role), desc(channelMembers.createdAt));

    return { ...(await channelById(tx, member, input.id)), members };
  });

/** A new channel, with its creator as its admin and `memberIds` as members. */
const create = writes(PERMISSIONS.channelManage)
  .errors(channelErrors)
  .input(
    z.object({
      name: Name,
      description: Description.default(''),
      icon: Icon.optional(),
      memberIds: z.array(z.string()).max(500).default([]),
    }),
  )
  .output(Channel)
  .handler(async ({ input: { memberIds: others, ...fields }, context: { tx, member }, errors }) => {
    const [channel] = await tx
      .insert(channels)
      .values({ ...fields, orgId: member.orgId, createdBy: member.userId })
      .returning({ id: channels.id })
      .catch(nameTaken(errors, fields.name));

    if (!channel) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await insertMembers(tx, member, channel.id, [member.userId], 'admin');
    await insertMembers(tx, member, channel.id, others, 'member');

    return channelById(tx, member, channel.id);
  });

const update = writes(PERMISSIONS.channelView)
  .errors(channelErrors)
  .input(
    z.object({
      id: z.string(),
      name: Name,
      description: Description.optional(),
      icon: Icon.optional(),
    }),
  )
  .output(Channel)
  .handler(async ({ input: { id, ...fields }, context: { tx, member }, errors }) => {
    await channelFor(tx, member, id, { change: true });
    await tx
      .update(channels)
      .set(fields)
      .where(eq(channels.id, id))
      .catch(nameTaken(errors, fields.name));

    return channelById(tx, member, id);
  });

/** Deletes the channel and its memberships. */
const remove = writes(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }))
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.id, { change: true });
    await tx.delete(channels).where(eq(channels.id, input.id));

    return input;
  });

export const channelProcedures = { list, get, create, update, remove };
