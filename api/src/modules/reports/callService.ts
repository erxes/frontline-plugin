import { and, desc, eq, exists, gte, inArray, lte, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { calls } from '#/db/calls.ts';
import type { Tx } from '#/db/client.ts';
import { averageSeconds, Count, countWhere, dayOf, everyDay, type Range } from './shared.ts';

const UNANSWERED = ['missed', 'busy', 'failed', 'voicemail'] as const;

/** A missed call counts as called back by an outgoing call to its number within this many hours. */
const CALLBACK_HOURS = 24;

/** A caller who hangs up sooner than this was never offered to an agent. */
const SHORT_HANGUP_SECONDS = 5;

/** How many breaches the report lists, newest first. */
const BREACHES = 50;

export const incoming = eq(calls.direction, 'incoming');
export const missed = and(incoming, inArray(calls.status, UNANSWERED));
export const offered = and(incoming, inArray(calls.status, ['answered', ...UNANSWERED]));

/** How an incoming call ended: answered, hung up before `SHORT_HANGUP_SECONDS`, or unanswered. */
const OUTCOMES = ['answered', 'short', ...UNANSWERED] as const;

const Served = z.object({
  /** Ended incoming calls, less the short hang-ups. */
  offered: Count,
  /** Offered calls an agent answered or the organisation called back in time. */
  served: Count,
  /** Offered calls neither answered nor called back. */
  breached: Count,
});

export const CallService = z.object({
  /** Missed calls the organisation called back within `callbackHours`, and how soon. */
  calledBack: Count,
  /** Called back and answered. */
  reached: Count,
  callbackSeconds: z.number().nullable(),
  callbackHours: Count,
  shortHangupSeconds: Count,
  service: Served.extend({
    shortHangups: Count,
    /** Breached calls whose callback window is still open. */
    pending: Count,
  }),
  serviceDays: z.array(Served.extend({ day: z.string() })),
  /** The service by PBX queue, '' for calls outside any. */
  serviceQueues: z.array(Served.extend({ queue: z.string(), calledBack: Count })),
  /** Why calls went unanswered, and how many of each were called back. */
  missedReasons: z.array(
    z.object({ reason: z.enum(['short', ...UNANSWERED]), count: Count, calledBack: Count }),
  ),
  /** The newest breached calls, `BREACHES` at most. */
  breaches: z.array(
    z.object({
      id: z.string(),
      startedAt: z.date(),
      customerPhone: z.string(),
      queue: z.string().nullable(),
      waitSeconds: Count,
      pending: z.boolean(),
    }),
  ),
});

const callback = alias(calls, 'callback');
const missedAt = sql`coalesce(${calls.endedAt}, ${calls.startedAt})`;
const windowEnd = sql`${missedAt} + make_interval(hours => ${CALLBACK_HOURS})`;

/** An outgoing call on the same PBX to the missed call's number, within the callback window. */
const isCallback = and(
  eq(callback.accountId, calls.accountId),
  eq(callback.customerPhone, calls.customerPhone),
  eq(callback.direction, 'outgoing'),
  gte(callback.startedAt, missedAt),
  lte(callback.startedAt, windowEnd),
);

/**
 * Of the missed calls `theirs` picks, those an outgoing call reached back within `CALLBACK_HOURS`
 * of their end, those it got an answer from, and the average time to the first.
 */
const callbacks = async (tx: Tx, theirs: SQL) => {
  const attempts = tx
    .select({
      first: sql<Date | null>`min(${callback.startedAt})`.as('first'),
      reached: sql<boolean | null>`bool_or(${callback.status} = 'answered')`.as('reached'),
    })
    .from(callback)
    .where(isCallback)
    .as('attempts');

  const [row] = await tx
    .select({
      calledBack: sql<number>`count(${attempts.first})`.mapWith(Number),
      reached: countWhere(sql`${attempts.reached}`),
      callbackSeconds: averageSeconds(sql`extract(epoch from ${attempts.first} - ${missedAt})`),
    })
    .from(calls)
    .leftJoinLateral(attempts, sql`true`)
    .where(and(theirs, missed));

  return {
    calledBack: row?.calledBack ?? 0,
    reached: row?.reached ?? 0,
    callbackSeconds: row?.callbackSeconds ?? null,
    callbackHours: CALLBACK_HOURS,
  };
};

const waitSeconds = sql<number>`extract(epoch from ${missedAt} - ${calls.startedAt})::int`;
const short = sql`${waitSeconds} < ${SHORT_HANGUP_SECONDS}`;

type Tally = z.infer<typeof Served>;

const NONE: Tally = { offered: 0, served: 0, breached: 0 };

/** `tally` with `count` calls of one outcome, called back or not, added. */
const add = (tally: Tally, outcome: string, calledBack: boolean, count: number): Tally => {
  if (outcome === 'short') return tally;

  const served = outcome === 'answered' || calledBack ? count : 0;

  return {
    offered: tally.offered + count,
    served: tally.served + served,
    breached: tally.breached + count - served,
  };
};

/**
 * The service the incoming calls `theirs` picks got: answered or called back in time, by day, by
 * queue and by why the rest were missed, and the newest calls nobody served.
 */
export const serviceOf = async (tx: Tx, theirs: SQL, range: Range) => {
  const calledBack = sql<boolean>`${exists(
    tx
      .select({ one: sql`1` })
      .from(callback)
      .where(isCallback),
  )}`;

  const unserved = and(theirs, missed, sql`not ${short}`, sql`not ${calledBack}`);
  const pending = sql<boolean>`${windowEnd} > now()`;

  const groups = await tx
    .select({
      day: dayOf(calls.startedAt, range),
      queue: sql<string>`coalesce(${calls.queue}, '')`,
      outcome: sql<string>`case when ${calls.status} = 'answered' then 'answered' when ${short} then 'short' else ${calls.status} end`,
      calledBack: sql<boolean>`${calls.status} <> 'answered' and ${calledBack}`,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(calls)
    .where(and(theirs, offered))
    .groupBy(sql`1, 2, 3, 4`);

  const [open] = await tx
    .select({ pending: countWhere(pending) })
    .from(calls)
    .where(unserved);

  const breaches = await tx
    .select({
      id: calls.id,
      startedAt: calls.startedAt,
      customerPhone: calls.customerPhone,
      queue: calls.queue,
      waitSeconds,
      pending,
    })
    .from(calls)
    .where(unserved)
    .orderBy(desc(calls.startedAt), calls.id)
    .limit(BREACHES);

  const days = new Map<string, Tally>();
  const queues = new Map<string, Tally & { calledBack: number }>();
  const reasons = new Map<string, { count: number; calledBack: number }>();
  let total = NONE;

  for (const row of groups) {
    const back = row.calledBack ? row.count : 0;
    const queue = queues.get(row.queue) ?? { ...NONE, calledBack: 0 };
    const reason = reasons.get(row.outcome) ?? { count: 0, calledBack: 0 };

    total = add(total, row.outcome, row.calledBack, row.count);
    days.set(row.day, add(days.get(row.day) ?? NONE, row.outcome, row.calledBack, row.count));
    queues.set(row.queue, {
      ...add(queue, row.outcome, row.calledBack, row.count),
      calledBack: queue.calledBack + back,
    });
    reasons.set(row.outcome, {
      count: reason.count + row.count,
      calledBack: reason.calledBack + back,
    });
  }

  return {
    ...(await callbacks(tx, theirs)),
    shortHangupSeconds: SHORT_HANGUP_SECONDS,
    service: {
      ...total,
      shortHangups: reasons.get('short')?.count ?? 0,
      pending: open?.pending ?? 0,
    },
    serviceDays: everyDay(range).map((day) => ({ day, ...(days.get(day) ?? NONE) })),
    serviceQueues: [...queues]
      .map(([queue, tally]) => ({ queue, ...tally }))
      .filter((row) => row.offered > 0)
      .toSorted((a, b) => b.offered - a.offered || a.queue.localeCompare(b.queue)),
    missedReasons: OUTCOMES.flatMap((reason) => {
      const counted = reasons.get(reason);

      return reason !== 'answered' && counted ? [{ reason, ...counted }] : [];
    }),
    breaches,
  };
};
