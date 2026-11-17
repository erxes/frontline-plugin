import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { callOperators, callQueues, OPERATOR_STATUSES } from '#/db/calls.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { reads, writes } from '#/orpc.ts';
import { managesAll } from '../channels/access.ts';
import { call, pbxOf } from '../integrations/providers/call/call.ts';
import { pbxAction } from '../integrations/providers/call/pbx.ts';
import { signalCalls } from '../integrations/providers/call/record.ts';

const { orgId: _orgId, live: _live, ...queueColumns } = getTableColumns(callQueues);

const QueueAgent = z.object({
  extension: z.string(),
  name: z.string(),
  status: z.string(),
  answered: z.number(),
  abandoned: z.number(),
  talkSeconds: z.number(),
  pausedAt: z.string().nullable(),
});

const QueueLive = z.object({
  agents: z.array(QueueAgent),
  waiting: z.array(z.object({ callerId: z.string(), channel: z.string().nullable() })),
  talking: z.array(
    z.object({
      callerId: z.string(),
      calleeId: z.string().nullable(),
      since: z.string().nullable(),
    }),
  ),
});

const Queue = createSelectSchema(callQueues)
  .omit({ orgId: true, live: true })
  .extend({ accountName: z.string() });

/** Whether the caller answers the queue's PBX, or manages every channel. */
const answersSql = (member: PluginMember) =>
  managesAll(member)
    ? undefined
    : sql`exists (
        select 1 from ${callOperators}
        where ${callOperators.accountId} = ${callQueues.accountId}
          and ${callOperators.userId} = ${member.userId}
      )`;

const queueRows = (tx: Tx, member: PluginMember) =>
  tx
    .select({ ...queueColumns, accountName: integrationAccounts.name })
    .from(callQueues)
    .innerJoin(integrationAccounts, eq(integrationAccounts.id, callQueues.accountId))
    .where(answersSql(member))
    .$dynamic();

/** The queues of the PBXs the caller answers, with their counters for the day. */
const list = reads(PERMISSIONS.callView)
  .input(z.object({}))
  .output(z.array(Queue))
  .handler(({ context: { tx, member } }) =>
    queueRows(tx, member).orderBy(integrationAccounts.name, callQueues.queue),
  );

/** One queue, with its live board as the PBX last sent it. */
const get = reads(PERMISSIONS.callView)
  .input(z.object({ id: z.string() }))
  .output(Queue.extend({ live: QueueLive.nullable(), liveAt: z.date().nullable() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const [row] = await tx
      .select({ ...queueColumns, accountName: integrationAccounts.name, live: callQueues.live })
      .from(callQueues)
      .innerJoin(integrationAccounts, eq(integrationAccounts.id, callQueues.accountId))
      .where(and(eq(callQueues.id, input.id), answersSql(member)));

    if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such queue' });

    return row;
  });

const Agent = createSelectSchema(callOperators)
  .omit({ orgId: true, sipSecret: true })
  .extend({ status: z.enum(OPERATOR_STATUSES), accountName: z.string() });

const {
  orgId: _operatorOrg,
  sipSecret: _sipSecret,
  ...operatorColumns
} = getTableColumns(callOperators);

/** The caller's extensions on each PBX, with what they last told its queues. */
const mine = reads(PERMISSIONS.callView)
  .input(z.object({}))
  .output(z.array(Agent))
  .handler(({ context: { tx, member } }) =>
    tx
      .select({ ...operatorColumns, accountName: integrationAccounts.name })
      .from(callOperators)
      .innerJoin(integrationAccounts, eq(integrationAccounts.id, callOperators.accountId))
      .where(eq(callOperators.userId, member.userId))
      .orderBy(integrationAccounts.name),
  );

/** Pauses or resumes the caller in their PBX's queues: a paused agent gets no queue calls. */
const setStatus = writes(PERMISSIONS.callView)
  .input(z.object({ accountId: z.string(), status: z.enum(['available', 'paused']) }))
  .output(Agent)
  .handler(async ({ input, context: { tx, member } }) => {
    const [found] = await tx
      .select({ operator: operatorColumns, account: integrationAccounts })
      .from(callOperators)
      .innerJoin(integrationAccounts, eq(integrationAccounts.id, callOperators.accountId))
      .where(
        and(eq(callOperators.accountId, input.accountId), eq(callOperators.userId, member.userId)),
      );

    if (!found) throw new ORPCError('NOT_FOUND', { message: 'You have no extension on this PBX' });

    await pbxAction(
      pbxOf(call.open(found.account).account),
      'pauseUnpauseQueueAgent',
      z.unknown(),
      {
        operatetype: input.status === 'paused' ? 'pause' : 'unpause',
        interface: found.operator.extension,
      },
    ).catch((error: unknown) => {
      throw new ORPCError('BAD_GATEWAY', {
        message: error instanceof Error ? error.message : 'The PBX did not answer',
      });
    });

    const [saved] = await tx
      .update(callOperators)
      .set({ status: input.status })
      .where(eq(callOperators.id, found.operator.id))
      .returning(operatorColumns);

    if (!saved) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await signalCalls(tx, member.orgId);

    return { ...saved, accountName: found.account.name };
  });

export const queueProcedures = { list, get };

export const agentProcedures = { mine, setStatus };
