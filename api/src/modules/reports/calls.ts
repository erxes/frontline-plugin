import { and, count, desc, eq, inArray, isNotNull, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { calls } from '#/db/calls.ts';
import type { Tx } from '#/db/client.ts';
import { conversations } from '#/db/inbox.ts';
import { channelMembers } from '#/db/schema.ts';
import { compileFilter } from '@erxes/plugin-sdk/filter';
import { reads } from '#/orpc.ts';
import { CALL_FILTER } from '../calls/calls.ts';
import { membership, seenBy } from '../channels/access.ts';
import { CallService, incoming, missed, offered, serviceOf } from './callService.ts';
import {
  averageSeconds,
  Count,
  countWhere,
  dayOf,
  everyDay,
  type Range,
  ReportInput,
  secondsBetween,
  TOP,
  within,
} from './shared.ts';

/** An incoming call answered within this many seconds meets the service level. */
const SERVICE_LEVEL_SECONDS = 20;

const CallReport = z
  .object({
    /** Calls that started in the period. */
    total: Count,
    incoming: Count,
    outgoing: Count,
    answered: Count,
    /** Incoming calls an agent answered. */
    answeredIncoming: Count,
    /** Incoming calls that ended unanswered: missed, busy, failed or sent to voicemail. */
    missed: Count,
    /** From ringing to answer, over the period's answered incoming calls. */
    waitSeconds: z.number().nullable(),
    /** The talk time of the period's answered calls. */
    talkSeconds: z.number().nullable(),
    /** The share of ended incoming calls answered within `serviceLevelSeconds`, or null with none. */
    serviceLevel: z.number().nullable(),
    serviceLevelSeconds: Count,
    days: z.array(
      z.object({
        day: z.string(),
        incoming: Count,
        outgoing: Count,
        answered: Count,
        missed: Count,
      }),
    ),
    /** Calls by weekday, 1 Monday to 7 Sunday, and hour in the member's time zone. */
    hours: z.array(
      z.object({
        weekday: z.number().int(),
        hour: z.number().int(),
        total: Count,
        answered: Count,
      }),
    ),
    /** The members who answered the most calls, with their talk time. */
    agents: z.array(
      z.object({
        userId: z.string(),
        answered: Count,
        talkSeconds: Count,
        /** The shortest and longest of their answered calls. */
        shortestSeconds: Count,
        longestSeconds: Count,
      }),
    ),
    /** The numbers that called or were called the most. */
    numbers: z.array(
      z.object({ customerPhone: z.string(), total: Count, answered: Count, missed: Count }),
    ),
    /** The busiest PBX queues, by their incoming calls. */
    queues: z.array(
      z.object({
        queue: z.string(),
        total: Count,
        answered: Count,
        missed: Count,
        waitSeconds: z.number().nullable(),
        talkSeconds: z.number().nullable(),
      }),
    ),
  })
  .and(CallService);

const outgoing = eq(calls.direction, 'outgoing');
const answered = eq(calls.status, 'answered');
const waited = secondsBetween(calls.startedAt, calls.answeredAt);

/** The calls `theirs` picks by weekday and hour, and their busiest agents, numbers and queues. */
const breakdowns = async (tx: Tx, theirs: SQL, range: Range) => {
  const local = sql`${calls.startedAt} at time zone ${range.timeZone}`;

  const hours = await tx
    .select({
      weekday: sql<number>`extract(isodow from ${local})::int`,
      hour: sql<number>`extract(hour from ${local})::int`,
      total: count(),
      answered: countWhere(answered),
    })
    .from(calls)
    .where(theirs)
    .groupBy(sql`1, 2`)
    .orderBy(sql`1, 2`);

  const agents = await tx
    .select({
      userId: sql<string>`${calls.answeredBy}`,
      answered: count(),
      talkSeconds: sql<number>`coalesce(sum(${calls.durationSec}), 0)::int`,
      shortestSeconds: sql<number>`coalesce(min(${calls.durationSec}), 0)::int`,
      longestSeconds: sql<number>`coalesce(max(${calls.durationSec}), 0)::int`,
    })
    .from(calls)
    .where(and(theirs, answered, isNotNull(calls.answeredBy)))
    .groupBy(calls.answeredBy)
    .orderBy(desc(count()), calls.answeredBy)
    .limit(TOP);

  const numbers = await tx
    .select({
      customerPhone: calls.customerPhone,
      total: count(),
      answered: countWhere(answered),
      missed: countWhere(missed),
    })
    .from(calls)
    .where(theirs)
    .groupBy(calls.customerPhone)
    .orderBy(desc(count()), calls.customerPhone)
    .limit(TOP);

  const queues = await tx
    .select({
      queue: sql<string>`${calls.queue}`,
      total: count(),
      answered: countWhere(answered),
      missed: countWhere(missed),
      waitSeconds: averageSeconds(waited, answered),
      talkSeconds: averageSeconds(calls.durationSec, answered),
    })
    .from(calls)
    .where(and(theirs, incoming, isNotNull(calls.queue)))
    .groupBy(calls.queue)
    .orderBy(desc(count()), calls.queue)
    .limit(TOP);

  return { hours, agents, numbers, queues };
};

/**
 * The calls of the member's channels the card's filter keeps, over a period: volume, answers, waits
 * and talk time, by day and by hour of the week, and the busiest agents and numbers.
 */
export const callReport = reads(PERMISSIONS.callView)
  .route({
    summary:
      'Report calls, answers, waits and talk time from/to (ISO date-times) by day and hour in an IANA timeZone; times in seconds',
  })
  .input(ReportInput)
  .output(CallReport)
  .handler(async ({ input: range, context: { tx, member } }) => {
    /** The member's calls in the period. */
    const theirs = inArray(
      calls.id,
      tx
        .select({ id: calls.id })
        .from(calls)
        .innerJoin(conversations, eq(conversations.id, calls.conversationId))
        .leftJoin(channelMembers, membership(member, conversations.channelId))
        .where(
          and(
            seenBy(member, conversations.channelId),
            compileFilter(CALL_FILTER, range.filter, { me: member.userId }),
            within(calls.startedAt, range),
          ),
        ),
    );

    const [totals] = await tx
      .select({
        total: count(),
        incoming: countWhere(incoming),
        outgoing: countWhere(outgoing),
        answered: countWhere(answered),
        answeredIncoming: countWhere(and(incoming, answered)),
        missed: countWhere(missed),
        waitSeconds: averageSeconds(waited, and(incoming, answered)),
        talkSeconds: averageSeconds(calls.durationSec, answered),
        offered: countWhere(offered),
        inTarget: countWhere(and(incoming, answered, sql`${waited} <= ${SERVICE_LEVEL_SECONDS}`)),
      })
      .from(calls)
      .where(theirs);

    const days = await tx
      .select({
        day: dayOf(calls.startedAt, range),
        incoming: countWhere(incoming),
        outgoing: countWhere(outgoing),
        answered: countWhere(answered),
        missed: countWhere(missed),
      })
      .from(calls)
      .where(theirs)
      .groupBy(sql`1`);

    const byDay = new Map(days.map((row) => [row.day, row]));
    const asked = totals?.offered ?? 0;

    return {
      total: totals?.total ?? 0,
      incoming: totals?.incoming ?? 0,
      outgoing: totals?.outgoing ?? 0,
      answered: totals?.answered ?? 0,
      answeredIncoming: totals?.answeredIncoming ?? 0,
      missed: totals?.missed ?? 0,
      waitSeconds: totals?.waitSeconds ?? null,
      talkSeconds: totals?.talkSeconds ?? null,
      serviceLevel: asked ? (totals?.inTarget ?? 0) / asked : null,
      serviceLevelSeconds: SERVICE_LEVEL_SECONDS,
      days: everyDay(range).map(
        (day) => byDay.get(day) ?? { day, incoming: 0, outgoing: 0, answered: 0, missed: 0 },
      ),
      ...(await breakdowns(tx, theirs, range)),
      ...(await serviceOf(tx, theirs, range)),
    };
  });
