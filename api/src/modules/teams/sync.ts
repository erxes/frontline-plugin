import type { CoreClient } from '@erxes/plugin-sdk';
import { type Column, inArray, sql } from 'drizzle-orm';
import { core } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { teamMembers, teams, unitSync } from '#/db/teams.ts';
import { tickets } from '#/db/tickets.ts';
import { teamMemberIds } from './teams.ts';

type Unit = Awaited<ReturnType<CoreClient['units']['list']>>['data'][number];

/** Holds the organisation's copy for the rest of the transaction: one sync or adoption at a time. */
const hold = (tx: Tx, orgId: string) =>
  tx.execute(
    sql`select pg_advisory_xact_lock(hashtext('frontline_unit_sync'), hashtext(${orgId}))`,
  );

const textArray = (values: string[]) => sql`${sql.param(values)}::text[]`;

/** Moves the tickets naming a team in `from` to the unit it became, `to` at the same place. */
const remap = async (tx: Tx, from: string[], to: string[]) => {
  const target = (column: Column) =>
    sql<string>`(${textArray(to)})[array_position(${textArray(from)}, ${column})]`;

  await tx
    .update(tickets)
    .set({ departmentId: target(tickets.departmentId) })
    .where(inArray(tickets.departmentId, from));
  await tx
    .update(tickets)
    .set({ branchId: target(tickets.branchId) })
    .where(inArray(tickets.branchId, from));
};

/**
 * Deletes teams core no longer has, as deleting a team always did: their tickets keep no branch
 * or department, their members go with them and their children move to the top level.
 */
const dropTeams = async (tx: Tx, ids: string[]) => {
  if (ids.length === 0) return;

  await tx.update(tickets).set({ branchId: null }).where(inArray(tickets.branchId, ids));
  await tx.update(tickets).set({ departmentId: null }).where(inArray(tickets.departmentId, ids));
  await tx.delete(teams).where(inArray(teams.id, ids));
};

/**
 * A team as core imports it: a name of 1 to 200 characters, a code of up to 50, and no empty
 * ids, which old erxes saved for a cleared parent or supervisor.
 */
const importable = (team: {
  id: string;
  kind: Unit['kind'];
  name: string;
  code: string | null;
  parentId: string | null;
  supervisorId: string | null;
  memberIds: string[];
}) => {
  const code = team.code?.trim().slice(0, 50) || null;

  return {
    ...team,
    code,
    name: team.name.trim().slice(0, 200) || code || team.id,
    parentId: team.parentId || null,
    supervisorId: team.supervisorId || null,
  };
};

/**
 * Brings the organisation's own teams (made in frontline or imported from old erxes) to core,
 * once, before a sync can delete what core lacks. Core keeps their ids, or merges one into a
 * unit it has; tickets naming a merged team then name that unit. Answers how many went.
 */
const adopt = async (orgId: string) => {
  const local = await withOrg(orgId, async (tx) => {
    const [state] = await tx.select({ adoptedAt: unitSync.adoptedAt }).from(unitSync);

    if (state?.adoptedAt) return null;

    return tx
      .select({
        id: teams.id,
        kind: teams.kind,
        name: teams.name,
        code: teams.code,
        parentId: teams.parentId,
        supervisorId: teams.supervisorId,
        memberIds: teamMemberIds,
      })
      .from(teams);
  });

  if (!local) return 0;

  // Where each team went in core: its own id, or the unit it merged into.
  const ids: Record<string, string> =
    local.length > 0
      ? (await core.forOrg(orgId).units.import({ units: local.map(importable) })).ids
      : {};

  const moved = Object.entries(ids).filter(([from, to]) => from !== to);
  const from = moved.map(([id]) => id);
  const to = moved.map(([, id]) => id);

  await withOrg(orgId, async (tx) => {
    await hold(tx, orgId);

    if (moved.length > 0) await remap(tx, from, to);

    await tx
      .insert(unitSync)
      .values({ orgId, adoptedAt: new Date() })
      .onConflictDoUpdate({ target: unitSync.orgId, set: { adoptedAt: new Date() } });
  });

  return local.length;
};

/** Makes the members of every listed unit what core says, keeping rows that stay. */
const copyMembers = async (tx: Tx, orgId: string, units: Unit[]) => {
  const pairs = units.flatMap((unit) =>
    [...new Set(unit.memberIds)].map((userId) => [unit.id, userId] as const),
  );

  const unitIds = textArray(pairs.map(([unitId]) => unitId));
  const userIds = textArray(pairs.map(([, userId]) => userId));

  await tx.delete(teamMembers).where(
    sql`(${teamMembers.teamId}, ${teamMembers.userId}) not in (
      select * from unnest(${unitIds}, ${userIds}))`,
  );

  if (pairs.length === 0) return;

  await tx.execute(sql`insert into ${teamMembers} (org_id, team_id, user_id)
    select ${orgId}, unit_id, user_id from unnest(${unitIds}, ${userIds}) as listed(unit_id, user_id)
    on conflict do nothing`);
};

/**
 * Upserts every unit in one statement, so its parent foreign key is checked once all rows are
 * in, whatever order core lists them in. A parent that isn't listed is left out, so a unit is
 * never under a team that is about to go.
 */
const copyUnits = async (tx: Tx, orgId: string, units: Unit[]) => {
  if (units.length === 0) return;

  const listed = new Set(units.map((unit) => unit.id));

  await tx
    .insert(teams)
    .values(
      units.map((unit) => ({
        id: unit.id,
        orgId,
        kind: unit.kind,
        name: unit.name,
        code: unit.code,
        parentId: unit.parentId && listed.has(unit.parentId) ? unit.parentId : null,
        supervisorId: unit.supervisorId,
        createdAt: new Date(unit.createdAt),
        updatedAt: new Date(unit.updatedAt),
      })),
    )
    .onConflictDoUpdate({
      target: teams.id,
      set: {
        kind: sql`excluded.kind`,
        name: sql`excluded.name`,
        code: sql`excluded.code`,
        parentId: sql`excluded.parent_id`,
        supervisorId: sql`excluded.supervisor_id`,
        updatedAt: sql`excluded.updated_at`,
      },
    });
};

/**
 * Makes the copy core's list: every unit with its members, and no team core lacks. A list read
 * before the one already copied (another replica's sync) changes nothing.
 */
const resync = async (orgId: string) => {
  const readAt = new Date();
  const { data: units } = await core.forOrg(orgId).units.list({});

  return withOrg(orgId, async (tx) => {
    await hold(tx, orgId);

    const [state] = await tx.select({ syncedAt: unitSync.syncedAt }).from(unitSync);

    if (state?.syncedAt && state.syncedAt >= readAt) return { units: 0, removed: 0 };

    await copyUnits(tx, orgId, units);
    await copyMembers(tx, orgId, units);

    const gone = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(sql`not (${teams.id} = any(${textArray(units.map((unit) => unit.id))}))`);

    await dropTeams(
      tx,
      gone.map((team) => team.id),
    );

    await tx
      .insert(unitSync)
      .values({ orgId, syncedAt: readAt })
      .onConflictDoUpdate({ target: unitSync.orgId, set: { syncedAt: readAt } });

    return { units: units.length, removed: gone.length };
  });
};

const syncOnce = async (orgId: string) => {
  const adopted = await adopt(orgId);

  return { adopted, ...(await resync(orgId)) };
};

type Synced = Awaited<ReturnType<typeof syncOnce>>;

/** Per organisation: the sync running, and the one queued after it that later calls share. */
const queues = new Map<string, { last: Promise<Synced>; next?: Promise<Synced> }>();

/**
 * Brings the organisation's own teams to core if they haven't gone yet, then copies core's
 * branches and departments into `frontline_teams`. A burst of `core.unit.*` events costs two
 * syncs: calls made while one runs share the single one queued after it.
 */
export const syncUnits = (orgId: string): Promise<Synced> => {
  const queued = queues.get(orgId);

  if (queued?.next) return queued.next;

  const entry: { last: Promise<Synced>; next?: Promise<Synced> } = {
    // A failed run rejects for the calls that shared it; the next one starts regardless.
    last: (queued?.last ?? Promise.resolve())
      .catch(() => undefined)
      .then(async () => {
        entry.next = undefined;

        return syncOnce(orgId);
      }),
  };

  entry.next = entry.last;
  queues.set(orgId, entry);

  const settle = () => {
    if (queues.get(orgId) === entry) queues.delete(orgId);
  };

  entry.last.then(settle, settle);

  return entry.last;
};
