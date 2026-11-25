import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { callOperators, callQueues, OPERATOR_STATUSES, QueueLive } from '#/db/calls.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { reads, writesWithCore } from '#/orpc.ts';
import { managesAll } from '../channels/access.ts';
import { call, pbxOf } from '../integrations/providers/call/call.ts';
import { pbxAction, pbxFailed } from '../integrations/providers/call/pbx.ts';
import { signalCalls } from '../integrations/providers/call/record.ts';

const { orgId: _orgId, live: _live, ...queueColumns } = getTableColumns(callQueues);

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
  .route({ summary: "List the call queues of the PBXes you answer, with today's counters" })
  .input(z.object({}))
  .output(z.array(Queue))
  .handler(({ context: { tx, member } }) =>
    queueRows(tx, member).orderBy(integrationAccounts.name, callQueues.queue),
  );

/** One queue, with its live board as the PBX last sent it. */
const get = reads(PERMISSIONS.callView)
  .route({ summary: 'Get one call queue with its live board as the PBX last sent it' })
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
  .route({ summary: 'List your extensions on each PBX, with your queue status' })
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

/**
 * Pauses or resumes the caller in their PBX's queues: a paused agent gets no queue calls. The
 * PBX is told first, outside the transaction, and its refusal changes nothing.
 */
const setStatus = writesWithCore(
  PERMISSIONS.callView,
  z.object({ accountId: z.string(), status: z.enum(['available', 'paused']) }),
  async (member, input) => {
    const found = await withOrg(member.orgId, async (tx) => {
      const [row] = await tx
        .select({ operator: operatorColumns, account: integrationAccounts })
        .from(callOperators)
        .innerJoin(integrationAccounts, eq(integrationAccounts.id, callOperators.accountId))
        .where(
          and(
            eq(callOperators.accountId, input.accountId),
            eq(callOperators.userId, member.userId),
          ),
        );

      return row;
    });

    if (!found) throw new ORPCError('NOT_FOUND', { message: 'You have no extension on this PBX' });

    await pbxAction(
      pbxOf(call.open(found.account).account),
      'pauseUnpauseQueueAgent',
      z.unknown(),
      {
        operatetype: input.status === 'paused' ? 'pause' : 'unpause',
        interface: found.operator.extension,
      },
    ).catch(pbxFailed);

    return { operatorId: found.operator.id, accountName: found.account.name };
  },
)
  .route({
    summary: "Pause or resume yourself in a PBX's queues; while paused you get no queue calls",
  })
  .output(Agent)
  .handler(async ({ input, context: { tx, member, fromCore } }) => {
    const [saved] = await tx
      .update(callOperators)
      .set({ status: input.status })
      .where(eq(callOperators.id, fromCore.operatorId))
      .returning(operatorColumns);

    if (!saved) throw new ORPCError('NOT_FOUND', { message: 'You have no extension on this PBX' });

    await signalCalls(tx, member.orgId);

    return { ...saved, accountName: fromCore.accountName };
  });

export const queueProcedures = { list, get };

export const agentProcedures = { mine, setStatus };
