import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, eq, getTableColumns, ilike, inArray, or, sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { TEAM_KINDS, teamMembers, teams } from '#/db/teams.ts';
import { tickets } from '#/db/tickets.ts';
import { reads, writes } from '#/orpc.ts';
import { Blank, Title } from '../fields.ts';
import { FilterInput, type FilterFields, filterSql, likeText } from '../filter.ts';

const { orgId, ...teamColumns } = getTableColumns(teams);

const memberIds = sql<string[]>`coalesce((
  select array_agg(listed.user_id order by listed.created_at)
  from ${teamMembers} listed where listed.team_id = ${teams.id}
), '{}')`;

/** The row and its members' core user ids. */
const Team = createSelectSchema(teams)
  .omit({ orgId: true })
  .extend({ memberIds: z.array(z.string()) });

const MemberIds = z.array(z.string()).max(1000);

const refine = { name: () => Title, code: () => Blank(100) };

const teamRows = (tx: Tx) =>
  tx
    .select({ ...teamColumns, memberIds })
    .from(teams)
    .$dynamic();

const teamById = async (tx: Tx, id: string) => {
  const [row] = await teamRows(tx).where(eq(teams.id, id));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such team' });

  return row;
};

/** Refuses an id that isn't a team of `kind`. */
export const assertTeam = async (
  tx: Tx,
  kind: (typeof TEAM_KINDS)[number],
  id: string | null | undefined,
) => {
  if (!id) return;

  const [row] = await tx
    .select({ id: teams.id })
    .from(teams)
    .where(and(eq(teams.id, id), eq(teams.kind, kind)));

  if (!row) throw new ORPCError('BAD_REQUEST', { message: `Pick a ${kind}` });
};

/**
 * Refuses a parent of another kind, and one under the team itself, so the tree has no loop.
 * The organisation's teams are held, so two moves at once can't make one either.
 */
const assertParent = async (
  tx: Tx,
  kind: (typeof TEAM_KINDS)[number],
  id: string | undefined,
  parentId: string | null | undefined,
) => {
  if (!parentId) return;

  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('frontline_teams'))`);
  await assertTeam(tx, kind, parentId);

  if (!id) return;

  const loop = await tx.execute<{ id: string }>(sql`
    with recursive up as (
      select ${teams.id} as id, ${teams.parentId} as parent_id from ${teams} where ${teams.id} = ${parentId}
      union
      select t.id, t.parent_id from ${teams} t join up on t.id = up.parent_id
    )
    select id from up where id = ${id}`);

  if (loop.rows.length > 0)
    throw new ORPCError('BAD_REQUEST', { message: 'A team cannot sit under itself' });
};

const setMembers = async (tx: Tx, member: PluginMember, teamId: string, userIds: string[]) => {
  await tx.delete(teamMembers).where(eq(teamMembers.teamId, teamId));

  if (userIds.length === 0) return;

  await tx
    .insert(teamMembers)
    .values([...new Set(userIds)].map((userId) => ({ orgId: member.orgId, teamId, userId })));
};

const TEAM_FILTER: FilterFields = {
  'subject.name': { kind: 'text', expr: teams.name },
  'subject.code': { kind: 'text', expr: teams.code },
  'subject.supervisorId': { kind: 'member', expr: teams.supervisorId },
  'subject.memberIds': { kind: 'members', expr: memberIds },
  'subject.createdAt': { kind: 'date', expr: teams.createdAt },
};

/** The departments or branches, by name, narrowed by the filter bar. Every member reads them. */
const list = reads(PERMISSIONS.channelView)
  .input(z.object({ kind: z.enum(TEAM_KINDS), ...FilterInput }))
  .output(z.array(Team))
  .handler(({ input, context: { tx, member } }) =>
    teamRows(tx)
      .where(
        and(
          eq(teams.kind, input.kind),
          input.search
            ? or(
                ilike(teams.name, likeText(input.search)),
                ilike(teams.code, likeText(input.search)),
              )
            : undefined,
          input.filter ? filterSql(TEAM_FILTER, input.filter, member.userId) : undefined,
        ),
      )
      .orderBy(asc(sql`lower(${teams.name})`)),
  );

const get = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Team)
  .handler(({ input, context: { tx } }) => teamById(tx, input.id));

const create = writes(PERMISSIONS.settingsManage)
  .input(
    createInsertSchema(teams, refine)
      .pick({ kind: true, name: true, code: true, parentId: true, supervisorId: true })
      .partial({ code: true, parentId: true, supervisorId: true })
      .extend({ memberIds: MemberIds.default([]) }),
  )
  .output(Team)
  .handler(async ({ input: { memberIds: userIds, ...fields }, context: { tx, member } }) => {
    await assertParent(tx, fields.kind, undefined, fields.parentId);

    const [row] = await tx
      .insert(teams)
      .values({ ...fields, orgId: member.orgId })
      .returning({ id: teams.id });

    if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await setMembers(tx, member, row.id, userIds);

    return teamById(tx, row.id);
  });

/** Changes what is given; `memberIds` replaces the members. */
const update = writes(PERMISSIONS.settingsManage)
  .input(
    createUpdateSchema(teams, refine)
      .pick({ name: true, code: true, parentId: true, supervisorId: true })
      .extend({ id: z.string(), memberIds: MemberIds.optional() }),
  )
  .output(Team)
  .handler(async ({ input: { id, memberIds: userIds, ...fields }, context: { tx, member } }) => {
    const team = await teamById(tx, id);

    await assertParent(tx, team.kind, id, fields.parentId);

    if (Object.keys(fields).length > 0) await tx.update(teams).set(fields).where(eq(teams.id, id));

    if (userIds) await setMembers(tx, member, id, userIds);

    return teamById(tx, id);
  });

/**
 * Deletes the teams with their members, all or none. Their children move to the top level and
 * their tickets keep no branch or department.
 */
const remove = writes(PERMISSIONS.settingsManage)
  .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx } }) => {
    await tx.update(tickets).set({ branchId: null }).where(inArray(tickets.branchId, input.ids));
    await tx
      .update(tickets)
      .set({ departmentId: null })
      .where(inArray(tickets.departmentId, input.ids));

    const removed = await tx
      .delete(teams)
      .where(inArray(teams.id, input.ids))
      .returning({ id: teams.id });

    return { ids: removed.map((row) => row.id) };
  });

/** The teams `userId` is in or supervises, which department and branch checks let them see. */
export const teamsOf = (userId: string) => sql`(
  select ${teamMembers.teamId} from ${teamMembers} where ${teamMembers.userId} = ${userId}
  union
  select ${teams.id} from ${teams} where ${teams.supervisorId} = ${userId}
)`;

export const teamProcedures = { list, get, create, update, remove };
