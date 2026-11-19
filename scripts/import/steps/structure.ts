// Teams, channels, channel members and Frontline's tags: the rows everything else hangs on.
import type { Document } from 'mongodb';
import type { Context } from '../context.ts';
import { put, skip } from '../engine.ts';
import type { Step } from '../step.ts';
import { createdOf, dateOf, idOf, idsOf, textOf, docId } from '../values.ts';

/** The channel the import makes for old records that had none: old forms, templates and tickets. */
export const FALLBACK_CHANNEL = 'officenext-import';

const FALLBACK_NAME = 'Imported from old erxes';

/** Old records the old copies hold beside `erxes`, read when `erxes` has no record by that id. */
export const already = (ctx: Context, kind: string, id: string | null) =>
  ctx.known(kind, id) !== undefined;

/** Parents before children, so a row-at-a-time retry still finds each parent. */
export const byDepth = (documents: Document[], parentField: string) => {
  const parents = new Map(documents.map((doc) => [docId(doc), idOf(doc[parentField])]));

  const depth = (id: string | null, seen = new Set<string>()): number => {
    const parent = id === null ? null : (parents.get(id) ?? null);

    if (parent === null || id === null || seen.has(id) || !parents.has(parent)) return 0;

    return 1 + depth(parent, new Set([...seen, id]));
  };

  return documents.toSorted((a, b) => depth(docId(a)) - depth(docId(b)));
};

const teamStep = (collection: 'departments' | 'branches', kind: 'department' | 'branch'): Step => ({
  source: `erxes.${collection}`,
  documents: async (ctx) => byDepth(await ctx.find(ctx.main, collection).toArray(), 'parentId'),
  transform: (doc, ctx) => {
    const id = docId(doc);
    const name = textOf(doc.title);

    if (!id || !name) return skip('no title');

    ctx.remember('team', id, id);

    const members = ctx.users(idsOf(doc.userIds));

    return put(
      [
        'frontline_teams',
        {
          id,
          kind,
          name,
          code: textOf(doc.code),
          // A team whose parent old erxes deleted moves to the top level.
          parent_id: ctx.known('team', idOf(doc.parentId)) ?? null,
          supervisor_id: ctx.user(idOf(doc.supervisorId)),
          created_at: createdOf(doc, doc.createdAt),
          updated_at: createdOf(doc, doc.updatedAt, doc.createdAt),
        },
      ],
      ...members.map(
        (userId) => ['frontline_team_members', { team_id: id, user_id: userId }] as const,
      ),
    );
  },
});

/** A member's own `departmentIds` and `branchIds`, which old core kept beside the teams' lists. */
const userTeamsStep: Step = {
  source: 'erxes.users',
  documents: (ctx) => ctx.find(ctx.main, 'users'),
  transform: (doc, ctx) => {
    const userId = ctx.user(docId(doc));
    const teams = ctx.knownAll('team', [...idsOf(doc.departmentIds), ...idsOf(doc.branchIds)]);

    if (!userId) return skip('no id');

    if (teams.length === 0) return skip('in no department or branch');

    return put(
      ...teams.map(
        (teamId) => ['frontline_team_members', { team_id: teamId, user_id: userId }] as const,
      ),
    );
  },
};

const fallbackChannelStep: Step = {
  source: 'import.fallback-channel',
  documents: () => [{ _id: FALLBACK_CHANNEL }],
  transform: (_doc, ctx) => {
    ctx.remember('channel', FALLBACK_CHANNEL, FALLBACK_CHANNEL);
    ctx.remember('channel.creator', FALLBACK_CHANNEL, ctx.owner);

    return put([
      'frontline_channels',
      {
        id: FALLBACK_CHANNEL,
        name: FALLBACK_NAME,
        description:
          'Old erxes forms, response templates and tickets that belonged to no channel. Move them to their channels.',
        created_by: ctx.owner,
      },
    ]);
  },
};

/** Old channels, with a personal inbox or a name the target has merged into that channel. */
const channelStep = (database: 'erxes' | 'erxes_office'): Step => {
  let names = new Map<string, string>();
  let owners = new Map<string, string>();

  return {
    source: `${database}.channels`,
    documents: async (ctx) => {
      names = await ctx.keyed(
        'frontline_channels',
        'CASE WHEN owner_id IS NULL THEN lower(name) END',
      );
      owners = await ctx.keyed('frontline_channels', 'owner_id');

      return ctx.find(database === 'erxes' ? ctx.main : ctx.office, 'channels');
    },
    transform: (doc, ctx) => {
      const id = docId(doc);
      const name = textOf(doc.name);

      if (!id || !name) return skip('no name');

      if (already(ctx, 'channel', id)) return skip('already in erxes by id');

      ctx.remember(`channel.${database}`, id, id);

      const creator = ctx.user(idOf(doc.createdBy) ?? idOf(doc.userId)) ?? ctx.owner;
      const owner = doc.scope === 'personal' ? creator : null;
      const keys = owner ? owners : names;
      const key = owner ?? name.toLowerCase();
      const existing = keys.get(key);

      ctx.remember('channel.creator', existing ?? id, creator);

      if (existing && existing !== id) {
        ctx.remember('channel', id, existing);

        return skip(
          owner
            ? "merged into the member's personal inbox"
            : 'merged into the channel of the same name',
        );
      }

      keys.set(key, id);
      ctx.remember('channel', id, id);

      return put([
        'frontline_channels',
        {
          id,
          name,
          description: textOf(doc.description) ?? '',
          icon: textOf(doc.icon),
          owner_id: owner,
          created_by: creator,
          created_at: createdOf(doc, doc.createdAt),
          updated_at: createdOf(doc, doc.updatedAt, doc.createdAt),
        },
      ]);
    },
  };
};

const ROLES: Record<string, 'admin' | 'member'> = {
  admin: 'admin',
  lead: 'admin',
  member: 'member',
};

const channelMembersStep: Step = {
  source: 'erxes.channel_members',
  documents: (ctx) => ctx.find(ctx.main, 'channel_members'),
  transform: (doc, ctx) => {
    const channelId = ctx.known('channel', idOf(doc.channelId));
    const userId = ctx.user(idOf(doc.memberId));
    const role = ROLES[String(doc.role)];

    if (!channelId) return skip('channel not imported');

    if (!userId) return skip('no member');

    if (!role) return skip(`unknown role ${String(doc.role)}`);

    return put([
      'frontline_channel_members',
      {
        channel_id: channelId,
        user_id: userId,
        role,
        created_by: ctx.known('channel.creator', channelId) ?? ctx.owner,
        created_at: dateOf(doc.createdAt) ?? undefined,
      },
    ]);
  },
};

/** The `memberIds` old channels kept beside `channel_members`; a member already in joins once. */
const channelMemberIdsStep = (database: 'erxes' | 'erxes_office'): Step => ({
  source: `${database}.channels.memberIds`,
  documents: (ctx) => ctx.find(database === 'erxes' ? ctx.main : ctx.office, 'channels'),
  transform: (doc, ctx) => {
    const channelId = ctx.known('channel', docId(doc));
    const members = ctx.users(idsOf(doc.memberIds));

    if (!channelId) return skip('channel not imported');

    // The old copy's members of a channel `erxes` still has are out of date.
    if (!ctx.known(`channel.${database}`, docId(doc))) return skip('channel read from erxes');

    if (members.length === 0) return skip('no members');

    const creator = ctx.known('channel.creator', channelId) ?? ctx.owner;

    return put(
      ...members.map(
        (userId) =>
          [
            'frontline_channel_members',
            { channel_id: channelId, user_id: userId, created_by: creator },
          ] as const,
      ),
    );
  },
});

/** Old tag types and the Frontline tag type each became. */
const TAG_TYPES: Record<string, 'conversation' | 'ticket' | 'form'> = {
  'frontline:conversation': 'conversation',
  'inbox:conversation': 'conversation',
  conversation: 'conversation',
  'frontline:ticket': 'ticket',
  'tickets:ticket': 'ticket',
  ticket: 'ticket',
  'frontline:form': 'form',
  // A lead integration's tags were its form's.
  'inbox:integration': 'form',
  integration: 'form',
};

const tagStep = (database: 'erxes' | 'erxes_office'): Step => {
  let names = new Map<string, string>();

  return {
    source: `${database}.tags`,
    documents: async (ctx) => {
      names = await ctx.keyed('frontline_tags', "type || ':' || lower(name)");
      ctx.report.note(
        `${database}.tags`,
        'only Frontline types (conversation, ticket, form); core and the other plugins import theirs',
      );

      return ctx.find(database === 'erxes' ? ctx.main : ctx.office, 'tags', {
        type: { $in: Object.keys(TAG_TYPES) },
      });
    },
    transform: (doc, ctx) => {
      const id = docId(doc);
      const name = textOf(doc.name);
      const type = TAG_TYPES[String(doc.type)];

      if (!id || !name || !type) return skip('no name');

      if (already(ctx, 'tag', id)) return skip('already in erxes by id');

      const key = `${type}:${name.toLowerCase()}`;
      const existing = names.get(key);

      if (existing && existing !== id) {
        ctx.remember('tag', id, existing);

        return skip(`merged into the ${type} tag of the same name`);
      }

      names.set(key, id);
      ctx.remember('tag', id, id);

      return put([
        'frontline_tags',
        {
          id,
          type,
          name,
          color_code: textOf(doc.colorCode),
          created_by: ctx.user(idOf(doc.userId) ?? idOf(doc.createdBy)) ?? ctx.owner,
          created_at: createdOf(doc, doc.createdAt),
          updated_at: createdOf(doc, doc.updatedAt, doc.createdAt),
        },
      ]);
    },
  };
};

export const STRUCTURE_STEPS: Step[] = [
  teamStep('departments', 'department'),
  teamStep('branches', 'branch'),
  userTeamsStep,
  fallbackChannelStep,
  channelStep('erxes'),
  channelStep('erxes_office'),
  channelMembersStep,
  channelMemberIdsStep('erxes'),
  channelMemberIdsStep('erxes_office'),
  tagStep('erxes'),
  tagStep('erxes_office'),
];
