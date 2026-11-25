import { and, count, eq, inArray, sql } from 'drizzle-orm';
import { alias, type PgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { callQueues, calls } from '#/db/calls.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { conversations } from '#/db/inbox.ts';
import { channelMembers } from '#/db/schema.ts';
import { reads } from '#/orpc.ts';
import { membership, seenBy } from '../channels/access.ts';
import { firstPageCount, PageInput, PageOutput } from '../paging.ts';
import { Call, callFields, callOrder } from './calls.ts';

/** How an incoming call ends when nobody talked to the caller. */
const UNREACHED = ['missed', 'busy', 'voicemail'] as const;

const later = alias(calls, 'later');
const answered = alias(calls, 'answered');

const unreached = (row: { direction: PgColumn; status: PgColumn }) =>
  and(eq(row.direction, 'incoming'), inArray(row.status, [...UNREACHED]));

/** Whether a call with the same number came after `calls` and someone talked on it. */
const reachedSince = sql`exists (
  select 1 from ${calls} as ${later} where ${later.customerPhone} = ${calls.customerPhone}
    and ${later.startedAt} > ${calls.startedAt} and ${later.status} = 'answered'
)`;

/** Whether the same number rang unanswered again after `calls`, so `calls` isn't its latest. */
const missedSince = sql`exists (
  select 1 from ${calls} as ${later} where ${later.customerPhone} = ${calls.customerPhone}
    and ${later.startedAt} > ${calls.startedAt} and ${unreached(later)}
)`;

/** How many times the number rang unanswered since anyone last talked to it. */
const missedCount = sql<number>`(
  select count(*) from ${calls} as ${later}
  where ${later.customerPhone} = ${calls.customerPhone} and ${unreached(later)}
    and not exists (
      select 1 from ${calls} as ${answered}
      where ${answered.customerPhone} = ${later.customerPhone}
        and ${answered.startedAt} > ${later.startedAt} and ${answered.status} = 'answered'
    )
)`.mapWith(Number);

/**
 * The numbers to call back: each caller whose latest incoming call nobody answered and who
 * nobody has talked to since, by that call, newest first. A call in either direction that
 * someone answers takes the number off the list.
 */
const list = reads(PERMISSIONS.callView)
  .route({
    summary: 'List the callers your channels missed and nobody has talked to since, newest first',
  })
  .input(z.object({ customerPhone: z.string().optional(), ...PageInput }))
  .output(z.object({ calls: z.array(Call.extend({ missedCount: z.number() })), ...PageOutput }))
  .handler(async ({ input, context: { tx, member } }) => {
    const matches = and(
      seenBy(member, conversations.channelId),
      unreached(calls),
      input.customerPhone ? eq(calls.customerPhone, input.customerPhone) : undefined,
      sql`not ${reachedSince}`,
      sql`not ${missedSince}`,
    );

    const rows = await tx
      .select({ ...callFields, missedCount })
      .from(calls)
      .innerJoin(conversations, eq(conversations.id, calls.conversationId))
      .innerJoin(integrationAccounts, eq(integrationAccounts.id, calls.accountId))
      .leftJoin(
        callQueues,
        and(eq(callQueues.accountId, calls.accountId), eq(callQueues.queue, calls.queue)),
      )
      .leftJoin(channelMembers, membership(member, conversations.channelId))
      .where(and(matches, callOrder.after(input.cursor)))
      .orderBy(...callOrder.orderBy)
      .limit(input.limit + 1);

    const totalCount = await firstPageCount(input.cursor, () =>
      tx
        .select({ value: count() })
        .from(calls)
        .innerJoin(conversations, eq(conversations.id, calls.conversationId))
        .leftJoin(channelMembers, membership(member, conversations.channelId))
        .where(matches),
    );

    const { items, nextCursor } = await callOrder.page(tx, rows, input.limit);

    return { calls: items, nextCursor, totalCount };
  });

export const callbackProcedures = { list };
