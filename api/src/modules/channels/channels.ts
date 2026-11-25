import type { PluginMember } from '@erxes/plugin-sdk';
import { type ORPCErrorConstructorMap, ORPCError } from '@orpc/server';
import { and, asc, eq, getTableColumns, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { CHANNEL_EVENTS, CHANNEL_REMOVED, PERMISSIONS } from '#/core.ts';
import { type Tx, uniqueViolation } from '#/db/client.ts';
import { forms } from '#/db/forms.ts';
import {
  CHANNEL_NAME_INDEX,
  CHANNEL_ROLES,
  channelMembers,
  channels,
  responseTemplates,
} from '#/db/schema.ts';
import { pipelines } from '#/db/tickets.ts';
import { reads, writes } from '#/orpc.ts';
import { compileFilter, type FilterFields } from '@erxes/plugin-sdk/filter';
import { auditRemoved, changedEvent } from '../events.ts';
import { FilterInput, likeText } from '../filter.ts';
import { pipelineSeen } from '../pipelines/rights.ts';
import {
  canChangeSql,
  channelFor,
  channelsFor,
  channelTimeline,
  insertMembers,
  managesAll,
  membership,
  publishChannelEvents,
  seenBy,
} from './access.ts';

const Name = z.string().trim().min(1).max(100);
const Description = z.string().trim().max(1000);
const Icon = z.string().max(100).nullable();

/** The row without `org_id`, which the caller already knows. */
const { orgId, ...channelColumns } = getTableColumns(channels);

/** The row, with its members and what the caller may do, which the query selects. */
const Channel = createSelectSchema(channels)
  .omit({ orgId: true })
  .extend({
    /** Its members' core user ids, admins first. */
    memberIds: z.array(z.string()),
    /** The caller's role, or null when they see it without belonging to it. */
    role: z.enum(CHANNEL_ROLES).nullable(),
    /** Whether the caller may rename it, delete it and change its members. */
    canManage: z.boolean(),
    pipelineCount: z.number(),
    formCount: z.number(),
    templateCount: z.number(),
  });

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

/** How many rows of `table` belong to the channel, as the old channel list counted them. */
const countIn = (
  table: typeof pipelines | typeof forms | typeof responseTemplates,
  seen = sql`true`,
) =>
  sql<number>`(select count(*)::int from ${table} where ${table.channelId} = ${channels.id} and ${seen})`;

/** The channel's pipelines the caller sees, private ones only where they may (`pipelineSeen`). */
const pipelineCount = (member: PluginMember) => countIn(pipelines, pipelineSeen(member));
const formCount = countIn(forms);
const templateCount = countIn(responseTemplates);

/**
 * Channels with their member ids, the caller's role, whether they manage it and how many
 * pipelines, forms and response templates it has, visible to `member`.
 */
const channelRows = (tx: Tx, member: PluginMember) =>
  tx
    .select({
      ...channelColumns,
      memberIds,
      role: channelMembers.role,
      canManage: canChangeSql(member),
      pipelineCount: pipelineCount(member),
      formCount,
      templateCount,
    })
    .from(channels)
    .leftJoin(channelMembers, membership(member, channels.id))
    .$dynamic();

/** One channel as the caller sees it. */
const channelById = async (tx: Tx, member: PluginMember, id: string) => {
  const [row] = await channelRows(tx, member).where(eq(channels.id, id));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such channel' });

  return row;
};

/** What the list's filter bar narrows channels by (`ui/src/modules/channels/ChannelsPage.tsx`). */
const channelFilter = (member: PluginMember): FilterFields => ({
  'subject.name': { type: 'text', expr: channels.name },
  'subject.description': { type: 'text', expr: channels.description },
  'subject.memberIds': { type: 'member', array: true, expr: memberIds },
  'subject.createdBy': { type: 'member', expr: channels.createdBy },
  'subject.pipelineCount': { type: 'number', expr: pipelineCount(member) },
  'subject.formCount': { type: 'number', expr: formCount },
  'subject.templateCount': { type: 'number', expr: templateCount },
  'subject.createdAt': { type: 'date', expr: channels.createdAt },
});

/**
 * The caller's channels, or every channel for a member who manages them all, by name, narrowed
 * by the filter bar: `search` matches the name or description, ignoring case.
 */
const list = reads(PERMISSIONS.channelView)
  .route({
    summary:
      'List your team channels by name, searched and filtered, and whether you may create one',
  })
  .input(z.object(FilterInput))
  .output(z.object({ channels: z.array(Channel), canCreate: z.boolean() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const channelList = await channelRows(tx, member)
      .where(
        and(
          isNull(channels.ownerId),
          seenBy(member, channels.id),
          input.search
            ? or(
                ilike(channels.name, likeText(input.search)),
                ilike(channels.description, likeText(input.search)),
              )
            : undefined,
          compileFilter(channelFilter(member), input.filter, { me: member.userId }),
        ),
      )
      .orderBy(asc(sql`lower(${channels.name})`));

    return { channels: channelList, canCreate: managesAll(member) };
  });

/** One channel; `channels.members` lists its members. */
const get = reads(PERMISSIONS.channelView)
  .route({ summary: 'Get one channel by id, with its counts and your role in it' })
  .input(z.object({ id: z.string() }))
  .output(Channel)
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.id, { change: false });

    return channelById(tx, member, input.id);
  });

/** A new channel, with its creator as its admin and `memberIds` as members. */
const create = writes(PERMISSIONS.channelManage)
  .route({ summary: 'Create a channel with you as its admin and the given members' })
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

    await publishChannelEvents(tx, member, [
      {
        entityId: channel.id,
        type: CHANNEL_EVENTS.created.type,
        summary: `Created ${fields.name}`,
        payload: { name: fields.name },
      },
    ]);
    await insertMembers(tx, member, channel.id, [member.userId], 'admin');
    await insertMembers(tx, member, channel.id, others, 'member');

    return channelById(tx, member, channel.id);
  });

/** The fields a change names on the timeline. */
const NAMES: [keyof z.infer<typeof Channel>, string][] = [
  ['name', 'name'],
  ['description', 'description'],
  ['icon', 'icon'],
];

/** Renames a channel, or changes its description or icon. */
const update = writes(PERMISSIONS.channelView)
  .route({ summary: 'Rename a channel you admin, or change its description or icon' })
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

    const before = await channelById(tx, member, id);

    await tx
      .update(channels)
      .set(fields)
      .where(eq(channels.id, id))
      .catch(nameTaken(errors, fields.name));

    const changed = await channelById(tx, member, id);

    await publishChannelEvents(
      tx,
      member,
      changedEvent(CHANNEL_EVENTS.fieldsChanged.type, NAMES, before, changed),
    );

    return changed;
  });

/** Deletes the channels and their memberships, all of them or none when the caller may not delete one. */
const remove = writes(PERMISSIONS.channelView)
  .route({ summary: 'Delete channels you admin and their memberships, all or none' })
  .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    await channelsFor(tx, member, input.ids, { change: true });

    const removed = await tx
      .delete(channels)
      .where(inArray(channels.id, input.ids))
      .returning({ id: channels.id, name: channels.name });

    await auditRemoved(tx, channelTimeline(member), CHANNEL_REMOVED, removed);

    return { ids: removed.map((row) => row.id) };
  });

/**
 * The caller's personal inbox, made on first ask: a channel only they belong to and see,
 * which the team list leaves out.
 */
const personal = writes(PERMISSIONS.channelView)
  .route({ summary: 'Get your personal inbox channel, created on first call' })
  .output(Channel)
  .handler(async ({ context: { tx, member } }) => {
    const [made] = await tx
      .insert(channels)
      .values({
        orgId: member.orgId,
        name: 'Personal inbox',
        ownerId: member.userId,
        createdBy: member.userId,
      })
      .onConflictDoNothing()
      .returning({ id: channels.id });

    if (made) {
      await publishChannelEvents(tx, member, [
        {
          entityId: made.id,
          type: CHANNEL_EVENTS.created.type,
          summary: 'Created a personal inbox',
          payload: { name: 'Personal inbox' },
        },
      ]);
      await insertMembers(tx, member, made.id, [member.userId], 'admin');
    }

    const [row] = await channelRows(tx, member).where(eq(channels.ownerId, member.userId));

    if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return row;
  });

export const channelProcedures = { list, get, create, update, remove, personal };
