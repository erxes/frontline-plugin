import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { TICKET_EVENTS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { pipelines, tickets } from '#/db/tickets.ts';
import { inOrder } from '../integrations/provider.ts';
import { publish, type TicketEvent } from './events.ts';

const now = sql`now()`;

/** One SLA clock: its columns, and what stamps each notice. */
const CLOCKS = [
  {
    key: 'firstResponse',
    name: 'first response',
    due: tickets.firstResponseDueAt,
    done: tickets.firstRespondedAt,
    warning: { stamp: tickets.firstResponseWarnedAt, set: { firstResponseWarnedAt: now } },
    breach: { stamp: tickets.firstResponseBreachedAt, set: { firstResponseBreachedAt: now } },
  },
  {
    key: 'resolution',
    name: 'resolution',
    due: tickets.resolutionDueAt,
    done: tickets.resolvedAt,
    warning: { stamp: tickets.resolutionWarnedAt, set: { resolutionWarnedAt: now } },
    breach: { stamp: tickets.resolutionBreachedAt, set: { resolutionBreachedAt: now } },
  },
] as const;

type Clock = (typeof CLOCKS)[number];

/** Told first a while before a clock runs out, then once it has. */
const STAGES = ['warning', 'breach'] as const;

type Stage = (typeof STAGES)[number];

const warnBefore = sql`make_interval(mins => (${pipelines.slaPolicy} ->> 'warnBeforeMinutes')::int)`;

/**
 * Stamps the running `clock` of active tickets that reached `stage` and haven't been told of it,
 * and returns them: the warning once the pipeline's `warnBeforeMinutes` before the due time, the
 * breach once it passed.
 */
const reach = (tx: Tx, clock: Clock, stage: Stage) => {
  const reached =
    stage === 'warning'
      ? sql`${pipelines.slaPolicy} ->> 'warnBeforeMinutes' is not null
          and now() >= ${clock.due} - ${warnBefore} and now() < ${clock.due}`
      : sql`now() >= ${clock.due}`;

  return tx
    .update(tickets)
    .set(clock[stage].set)
    .from(pipelines)
    .where(
      and(
        eq(pipelines.id, tickets.pipelineId),
        eq(tickets.state, 'active'),
        isNotNull(clock.due),
        isNull(clock.done),
        // A clock past its breach warns no more; the partial index on its due time says so too.
        isNull(clock.breach.stamp),
        isNull(clock[stage].stamp),
        reached,
      ),
    )
    .returning({
      id: tickets.id,
      name: tickets.name,
      assigneeId: tickets.assigneeId,
      assignedMemberIds: tickets.assignedMemberIds,
      customerId: tickets.customerId,
      due: clock.due,
    });
};

const EVENTS = { warning: TICKET_EVENTS.slaWarning, breach: TICKET_EVENTS.slaBreached };

/** One notice: on the ticket's timeline and in its assignees' inboxes. */
const notice = async (tx: Tx, clock: Clock, stage: Stage): Promise<TicketEvent[]> =>
  (await reach(tx, clock, stage)).map((row) => {
    const summary = `The ${clock.name} of ${row.name} is ${stage === 'warning' ? 'due soon' : 'overdue'}`;

    return {
      ticketId: row.id,
      type: EVENTS[stage].type,
      summary,
      payload: { clock: clock.key, dueAt: row.due?.toISOString() ?? null },
      customerId: row.customerId,
      notify: {
        userIds: [row.assigneeId, ...row.assignedMemberIds].filter((id) => id !== null),
        title: summary,
      },
    };
  });

/**
 * The SLA check core runs every five minutes for each organisation (`JOBS.sla`): tells a
 * ticket's assignees once a clock is about to run out and once it has, on the ticket's timeline.
 * Each notice is stamped in the transaction that publishes it, so a rerun sends nothing twice.
 */
export const checkSla = (orgId: string) =>
  withOrg(orgId, async (tx) => {
    const stages = CLOCKS.flatMap((clock) => STAGES.map((stage) => ({ clock, stage })));

    const events = (await inOrder(stages, ({ clock, stage }) => notice(tx, clock, stage))).flat();

    await publish(tx, { orgId, userId: null }, events);

    return { notified: events.length };
  });
