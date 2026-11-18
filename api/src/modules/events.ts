import { sql } from 'drizzle-orm';
import { PLUGIN } from '#/config.ts';
import type { Tx } from '#/db/client.ts';

/**
 * One entry on a record's timeline in core, about a customer when it names one, and the members
 * who hear of it.
 */
export type RecordEvent = {
  entityId: string;
  type: string;
  /** What the timeline shows; an event without one, such as an automation trigger, isn't shown. */
  summary: string | null;
  payload: Record<string, unknown>;
  customerId?: string | null;
  notify?: { userIds: string[]; title: string };
};

/**
 * Whose timeline the events land on, and who caused them: a member, or none for a visitor or a
 * job.
 */
type Timeline = {
  orgId: string;
  actorUserId: string | null;
  entityType: string;
  /** The record's page in web, which the entry links to. */
  linkOf: (id: string) => string;
  /** Each event also goes to core's audit log, which outlives the record's timeline. */
  audited: boolean;
};

export const same = (left: unknown, right: unknown) =>
  JSON.stringify(left) === JSON.stringify(right);

/**
 * A "changed" entry listing the `[field, name]` pairs of `names` whose values differ between
 * `before` and `after`, with both values of each, or none when nothing listed changed.
 */
export const changedEvent = <Row extends { id: string }>(
  type: string,
  names: [keyof Row, string][],
  before: Row,
  after: Row,
): RecordEvent[] => {
  const changed = names.filter(([field]) => !same(before[field], after[field]));

  if (changed.length === 0) return [];

  const fields = changed.map(([field]) => field);
  const pick = (row: Row) => Object.fromEntries(fields.map((field) => [field, row[field]]));

  return [
    {
      entityId: after.id,
      type,
      summary: `Changed ${changed.map(([, name]) => name).join(', ')}`,
      payload: { fields, before: pick(before), after: pick(after) },
    },
  ];
};

/** One row of core's audit log: who did what to the record, with what changed. */
const auditSql = (
  timeline: Timeline,
  entry: { action: string; entityId: string; label?: string; changes: unknown },
) => sql`core_record_audit(
  p_org_id => ${timeline.orgId},
  p_source => ${PLUGIN},
  p_action => ${entry.action},
  p_actor_user_id => ${timeline.actorUserId},
  p_target_type => ${timeline.entityType},
  p_target_id => ${entry.entityId},
  p_target_label => ${entry.label ?? null},
  p_changes => ${JSON.stringify(entry.changes)}::jsonb
)`;

/**
 * Publishes the events with core's `core_publish_event()` in the caller's transaction, so they
 * land on each record's Activity tab, and on its customer's, exactly when the change commits.
 * Each gets the moment it was published, not the transaction's start, so a record's events in one
 * change keep their order on the tab.
 * Core notifies each event's `notify` members but the one who made the change.
 */
export const publishEvents = async (tx: Tx, timeline: Timeline, events: RecordEvent[]) => {
  if (events.length === 0) return;

  const calls = events.map((event) => {
    const userIds = [...new Set(event.notify?.userIds)].filter((id) => id !== timeline.actorUserId);
    const notify = event.notify && userIds.length > 0 ? { ...event.notify, userIds } : null;

    const published = sql`core_publish_event(
      p_org_id => ${timeline.orgId},
      p_source => ${PLUGIN},
      p_type => ${event.type},
      p_payload => ${JSON.stringify(event.payload)}::jsonb,
      p_subject_type => ${event.customerId ? 'customer' : null},
      p_subject_id => ${event.customerId ?? null},
      p_notify => ${notify && JSON.stringify(notify)}::jsonb,
      p_summary => ${event.summary},
      p_link => ${timeline.linkOf(event.entityId)},
      p_actor_user_id => ${timeline.actorUserId},
      p_entity_type => ${timeline.entityType},
      p_entity_id => ${event.entityId},
      p_occurred_at => clock_timestamp()
    )`;

    return timeline.audited
      ? sql`${published}, ${auditSql(timeline, { action: event.type, entityId: event.entityId, changes: event.payload })}`
      : published;
  });

  await tx.execute(sql`select ${sql.join(calls, sql`, `)}`);
};

/** Records the removed records in core's audit log, which outlives their timelines. */
export const auditRemoved = async (
  tx: Tx,
  timeline: Timeline,
  action: string,
  removed: { id: string; name: string }[],
) => {
  if (removed.length === 0) return;

  const calls = removed.map((row) =>
    auditSql(timeline, {
      action,
      entityId: row.id,
      label: row.name,
      changes: { name: row.name },
    }),
  );

  await tx.execute(sql`select ${sql.join(calls, sql`, `)}`);
};
