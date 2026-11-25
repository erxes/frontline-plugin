import { ORPCError } from '@orpc/server';
import { and, asc, eq, getTableColumns, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { TEAM_KINDS, teamMembers, teams } from '#/db/teams.ts';
import { reads } from '#/orpc.ts';

const { orgId, ...teamColumns } = getTableColumns(teams);

/** The team's members' core user ids, oldest first. */
export const teamMemberIds = sql<string[]>`coalesce((
  select array_agg(listed.user_id order by listed.created_at)
  from ${teamMembers} listed where listed.team_id = ${teams.id}
), '{}')`;

/** The row and its members' core user ids. */
const Team = createSelectSchema(teams)
  .omit({ orgId: true })
  .extend({ memberIds: z.array(z.string()) });

const teamRows = (tx: Tx) =>
  tx
    .select({ ...teamColumns, memberIds: teamMemberIds })
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

/** The departments or branches, by name. Every member reads them. */
const list = reads(PERMISSIONS.channelView)
  .route({ summary: 'List the departments or the branches, by name' })
  .input(z.object({ kind: z.enum(TEAM_KINDS) }))
  .output(z.array(Team))
  .handler(({ input, context: { tx } }) =>
    teamRows(tx)
      .where(eq(teams.kind, input.kind))
      .orderBy(asc(sql`lower(${teams.name})`)),
  );

const get = reads(PERMISSIONS.channelView)
  .route({ summary: 'Get one department or branch by id' })
  .input(z.object({ id: z.string() }))
  .output(Team)
  .handler(({ input, context: { tx } }) => teamById(tx, input.id));

/**
 * The teams `userId` is in or supervises, and the teams under those, which department and
 * branch checks let them see.
 */
export const teamsOf = (userId: string) => sql`(
  with recursive held(id) as (
    select ${teamMembers.teamId} from ${teamMembers} where ${teamMembers.userId} = ${userId}
    union
    select ${teams.id} from ${teams} where ${teams.supervisorId} = ${userId}
    union
    select ${teams.id} from ${teams} join held on ${teams.parentId} = held.id
  )
  select id from held
)`;

/**
 * Read-only: branches and departments are core's, edited at `/settings/structure`, and
 * `sync.ts` copies them here.
 */
export const teamProcedures = { list, get };
