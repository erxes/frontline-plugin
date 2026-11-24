import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { withOrg } from '#/db/client.ts';
import { callQueues } from '#/db/calls.ts';
import type { AccountRow } from '../../provider.ts';
import { signalCalls } from './record.ts';

/** A queue's counters as the UCM reports them, in snake or camel case. */
const QueueStat = z
  .object({
    queue: z.coerce.string(),
    total_calls: z.coerce.number().optional(),
    totalCalls: z.coerce.number().optional(),
    answered_calls: z.coerce.number().optional(),
    answeredCalls: z.coerce.number().optional(),
    abandoned_calls: z.coerce.number().optional(),
    abandonedCalls: z.coerce.number().optional(),
    transfer_out_calls: z.coerce.number().optional(),
    transferOutCalls: z.coerce.number().optional(),
    avg_wait: z.coerce.number().optional(),
    avgWait: z.coerce.number().optional(),
    avg_talk: z.coerce.number().optional(),
    avgTalk: z.coerce.number().optional(),
    sla_rate: z.coerce.number().optional(),
    slaRate: z.coerce.number().optional(),
  })
  .transform((stat) => ({
    queue: stat.queue,
    totalCalls: stat.total_calls ?? stat.totalCalls ?? 0,
    answeredCalls: stat.answered_calls ?? stat.answeredCalls ?? 0,
    abandonedCalls: stat.abandoned_calls ?? stat.abandonedCalls ?? 0,
    transferredCalls: stat.transfer_out_calls ?? stat.transferOutCalls ?? 0,
    avgWait: stat.avg_wait ?? stat.avgWait ?? 0,
    avgTalk: stat.avg_talk ?? stat.avgTalk ?? 0,
    slaRate: stat.sla_rate ?? stat.slaRate ?? 0,
  }));

const QueueStats = z
  .union([
    z.object({ root_statistics: z.object({ queue: z.array(QueueStat) }) }),
    z.object({ queue: z.array(QueueStat) }),
    z.array(QueueStat),
  ])
  .transform((posted) =>
    Array.isArray(posted)
      ? posted
      : 'root_statistics' in posted
        ? posted.root_statistics.queue
        : posted.queue,
  );

/** A queue's live board as the bridge posts it. */
const QueueLive = z.object({
  queue: z.coerce.string(),
  state: z.object({
    agents: z
      .array(
        z.object({
          member_extension: z.coerce.string(),
          first_name: z.string().default(''),
          last_name: z.string().default(''),
          status: z.string().default(''),
          answer: z.coerce.number().default(0),
          abandon: z.coerce.number().default(0),
          talktime: z.coerce.number().default(0),
          pausetime: z.string().nullish(),
        }),
      )
      .default([]),
    waiting: z
      .array(z.object({ callerid: z.coerce.string(), callerchannel: z.string().nullish() }))
      .default([]),
    talking: z
      .array(
        z.object({
          callerid: z.coerce.string(),
          calleeid: z.coerce.string().nullish(),
          bridge_time: z.string().nullish(),
        }),
      )
      .default([]),
  }),
});

const setQueue = (
  row: AccountRow,
  queue: string,
  change: Partial<typeof callQueues.$inferInsert>,
) =>
  withOrg(row.orgId, async (tx) => {
    // Only the queues an admin added are kept.
    await tx
      .update(callQueues)
      .set(change)
      .where(and(eq(callQueues.accountId, row.id), eq(callQueues.queue, queue)));
    await signalCalls(tx, row.orgId);
  });

/** A PBX bridge's queue counters: each queue an admin added takes its numbers. */
export const recordQueueStats = async (row, body) => {
  await Promise.all(
    QueueStats.parse(body).map(({ queue, ...stats }) =>
      setQueue(row, queue, { ...stats, statsAt: new Date() }),
    ),
  );
};

/** A PBX bridge's live board of one queue: its agents, who waits and who talks. */
export const recordQueueLive = async (row, body) => {
  const { queue, state } = QueueLive.parse(body);

  await setQueue(row, queue, {
    live: {
      agents: state.agents.map((agent) => ({
        extension: agent.member_extension,
        name: [agent.first_name, agent.last_name].filter(Boolean).join(' '),
        status: agent.status,
        answered: agent.answer,
        abandoned: agent.abandon,
        talkSeconds: agent.talktime,
        pausedAt: agent.pausetime || null,
      })),
      waiting: state.waiting.map((caller) => ({
        callerId: caller.callerid,
        channel: caller.callerchannel ?? null,
      })),
      talking: state.talking.map((talk) => ({
        callerId: talk.callerid,
        calleeId: talk.calleeid ?? null,
        since: talk.bridge_time ?? null,
      })),
    },
    liveAt: new Date(),
  });
};
