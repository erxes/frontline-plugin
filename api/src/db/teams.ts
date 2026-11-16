import { sql } from 'drizzle-orm';
import { check, foreignKey, index, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { id, table } from './table.ts';

export const TEAM_KINDS = ['department', 'branch'] as const;

/**
 * A department or branch: a read-only copy of core's units, which `modules/teams/sync.ts` keeps
 * in step, so ticket visibility joins them in SQL. Units keep their ids in core, so old tickets'
 * `departmentId` and `branchId` still name them.
 */
export const teams = table(
  'teams',
  {
    id: id(),
    orgId: text().notNull(),
    kind: text({ enum: TEAM_KINDS }).notNull(),
    name: text().notNull(),
    code: text(),
    parentId: text(),
    /** A core user id: who leads it, and sees its tickets where a pipeline checks departments. */
    supervisorId: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique('frontline_teams_org_id_key').on(t.orgId, t.id),
    foreignKey({
      name: 'frontline_teams_parent_fkey',
      columns: [t.parentId],
      foreignColumns: [t.id],
    }).onDelete('set null'),
    index('frontline_teams_org_kind_name_idx').on(t.orgId, t.kind, t.name),
    index('frontline_teams_parent_idx').on(t.parentId),
    check('frontline_teams_kind_check', sql`${t.kind} in ('department', 'branch')`),
  ],
);

/** Who is in which team, copied from the unit's `memberIds`. Deleting the team removes its members. */
export const teamMembers = table(
  'team_members',
  {
    orgId: text().notNull(),
    teamId: text().notNull(),
    /** A core user id. */
    userId: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'frontline_team_members_pkey', columns: [t.orgId, t.teamId, t.userId] }),
    foreignKey({
      name: 'frontline_team_members_team_fkey',
      columns: [t.orgId, t.teamId],
      foreignColumns: [teams.orgId, teams.id],
    }).onDelete('cascade'),
    index('frontline_team_members_org_user_idx').on(t.orgId, t.userId),
  ],
);

/**
 * Where an organisation's copy of core's units stands. `adoptedAt`: when its own teams went to
 * core, once, before any sync deletes what core lacks; the Mongo import clears it. `syncedAt`:
 * when the list last copied was read from core, so an older list never replaces a newer one.
 */
export const unitSync = table('unit_sync', {
  orgId: text().primaryKey(),
  adoptedAt: timestamp({ withTimezone: true }),
  syncedAt: timestamp({ withTimezone: true }),
});
