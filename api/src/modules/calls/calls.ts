import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, count, eq, getTableColumns, ilike } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { CALL_DIRECTIONS, CALL_STATUSES, callQueues, calls } from '#/db/calls.ts';
import { conversations } from '#/db/inbox.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { channelMembers } from '#/db/schema.ts';
import { Attachment } from '#/db/table.ts';
import { reads, writes } from '#/orpc.ts';
import { membership } from '../channels/access.ts';
import { FilterInput, type FilterFields, filterSql, likeText } from '../filter.ts';
import { seenBy } from '../inbox/shared.ts';
import { queueRecording } from '../integrations/providers/call/record.ts';
import { orderOf, PageInput, pageOf } from '../paging.ts';

const { orgId: _orgId, ...callColumns } = getTableColumns(calls);

/** The row, with the line it came through. */
const Call = createSelectSchema(calls, {
  direction: z.enum(CALL_DIRECTIONS),
  status: z.enum(CALL_STATUSES),
  recording: () => Attachment.nullable(),
})
  .omit({ orgId: true })
  .extend({ accountName: z.string(), provider: z.string(), queueName: z.string().nullable() });

/**
 * Calls as the caller sees them: their channels', or every channel's for one who manages all. Each
 * has the name its queue goes by in settings, or null for a queue no admin added.
 */
const callRows = (tx: Tx, member: PluginMember) =>
  tx
    .select({
      ...callColumns,
      accountName: integrationAccounts.name,
      provider: integrationAccounts.provider,
      queueName: callQueues.name,
    })
    .from(calls)
    .innerJoin(conversations, eq(conversations.id, calls.conversationId))
    .innerJoin(integrationAccounts, eq(integrationAccounts.id, calls.accountId))
    .leftJoin(
      callQueues,
      and(eq(callQueues.accountId, calls.accountId), eq(callQueues.queue, calls.queue)),
    )
    .leftJoin(channelMembers, membership(member, conversations.channelId))
    .$dynamic();

/** The `subject.<field>` paths the call list's filter bar names. */
const CALL_FILTER: FilterFields = {
  'subject.status': { kind: 'select', expr: calls.status },
  'subject.direction': { kind: 'select', expr: calls.direction },
  'subject.customerPhone': { kind: 'text', expr: calls.customerPhone },
  'subject.number': { kind: 'text', expr: calls.number },
  'subject.queue': { kind: 'text', expr: calls.queue },
  'subject.extension': { kind: 'text', expr: calls.extension },
  'subject.answeredBy': { kind: 'member', expr: calls.answeredBy },
  'subject.startedAt': { kind: 'date', expr: calls.startedAt },
  'subject.durationSec': { kind: 'number', expr: calls.durationSec },
};

const order = orderOf(calls, calls.startedAt);

/** The calls of the caller's channels, newest first, narrowed by the filter bar. */
const list = reads(PERMISSIONS.callView)
  .input(z.object({ ...FilterInput, ...PageInput }))
  .output(
    z.object({ calls: z.array(Call), nextCursor: z.string().nullable(), totalCount: z.number() }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    const matches = and(
      seenBy(member),
      input.search ? ilike(calls.customerPhone, likeText(input.search)) : undefined,
      input.filter ? filterSql(CALL_FILTER, input.filter, member.userId) : undefined,
    );

    const rows = await callRows(tx, member)
      .where(and(matches, order.after(input.cursor)))
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const [total] = await tx
      .select({ value: count() })
      .from(calls)
      .innerJoin(conversations, eq(conversations.id, calls.conversationId))
      .leftJoin(channelMembers, membership(member, conversations.channelId))
      .where(matches);

    const { items, nextCursor } = pageOf(rows, input.limit);

    return { calls: items, nextCursor, totalCount: total?.value ?? 0 };
  });

const callById = async (tx: Tx, member: PluginMember, id: string) => {
  const [row] = await callRows(tx, member).where(and(eq(calls.id, id), seenBy(member)));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such call' });

  return row;
};

/** One call of the caller's channels, or of the inbox conversation it lives in. */
const get = reads(PERMISSIONS.callView)
  .input(z.union([z.object({ id: z.string() }), z.object({ conversationId: z.string() })]))
  .output(Call)
  .handler(async ({ input, context: { tx, member } }) => {
    if ('id' in input) return callById(tx, member, input.id);

    const [row] = await callRows(tx, member).where(
      and(eq(calls.conversationId, input.conversationId), seenBy(member)),
    );

    if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such call' });

    return row;
  });

/** Asks the PBX for an answered call's recording again, for one it hadn't written yet. */
const fetchRecording = writes(PERMISSIONS.callView)
  .input(z.object({ id: z.string() }))
  .output(Call)
  .handler(async ({ input, context: { tx, member } }) => {
    const row = await callById(tx, member, input.id);

    if (row.provider !== 'call' || row.status !== 'answered')
      throw new ORPCError('BAD_REQUEST', { message: 'Only an answered PBX call has a recording' });

    if (!row.recording) await queueRecording(tx, member.orgId, row.id);

    return row;
  });

export const callListProcedures = { list, get, fetchRecording };
