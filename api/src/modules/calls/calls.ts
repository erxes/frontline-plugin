import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, count, eq, exists, getTableColumns, ilike, or } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { CALL_DIRECTIONS, CALL_STATUSES, callOperators, callQueues, calls } from '#/db/calls.ts';
import { conversations } from '#/db/inbox.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { channelMembers } from '#/db/schema.ts';
import { StoredFile } from '#/db/table.ts';
import { reads, writes } from '#/orpc.ts';
import { membership, seenBy } from '../channels/access.ts';
import { compileFilter, type FilterFields } from '@erxes/plugin-sdk/filter';
import { FilterInput, likeText } from '../filter.ts';
import { queueRecording } from '../integrations/providers/call/record.ts';
import { firstPageCount, orderOf, PageInput, PageOutput } from '../paging.ts';

const { orgId: _orgId, ...callColumns } = getTableColumns(calls);

/** The row, with the line it came through. */
const Call = createSelectSchema(calls, {
  direction: z.enum(CALL_DIRECTIONS),
  status: z.enum(CALL_STATUSES),
  recording: () => StoredFile.nullable(),
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

/**
 * The `subject.<field>` paths the call list's filter bar names, and a report card's. The query
 * joins the call's conversation.
 */
export const CALL_FILTER: FilterFields = {
  'subject.channelId': { type: 'select', expr: conversations.channelId },
  'subject.status': { type: 'select', expr: calls.status },
  'subject.direction': { type: 'select', expr: calls.direction },
  'subject.customerPhone': { type: 'text', expr: calls.customerPhone },
  'subject.number': { type: 'text', expr: calls.number },
  'subject.queue': { type: 'text', expr: calls.queue },
  'subject.extension': { type: 'text', expr: calls.extension },
  'subject.answeredBy': { type: 'member', expr: calls.answeredBy },
  'subject.startedAt': { type: 'date', expr: calls.startedAt },
  'subject.durationSec': { type: 'number', expr: calls.durationSec },
};

const order = orderOf(calls, calls.startedAt);

/** The calls of the caller's channels, newest first, narrowed by the filter bar. */
const list = reads(PERMISSIONS.callView)
  .route({
    summary: "List your channels' calls, newest first, searched by phone, filtered and paged",
  })
  .input(z.object({ ...FilterInput, ...PageInput }))
  .output(z.object({ calls: z.array(Call), ...PageOutput }))
  .handler(async ({ input, context: { tx, member } }) => {
    const matches = and(
      seenBy(member, conversations.channelId),
      input.search ? ilike(calls.customerPhone, likeText(input.search)) : undefined,
      compileFilter(CALL_FILTER, input.filter, { me: member.userId }),
    );

    const rows = await callRows(tx, member)
      .where(and(matches, order.after(input.cursor)))
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const totalCount = await firstPageCount(input.cursor, () =>
      tx
        .select({ value: count() })
        .from(calls)
        .innerJoin(conversations, eq(conversations.id, calls.conversationId))
        .leftJoin(channelMembers, membership(member, conversations.channelId))
        .where(matches),
    );

    const { items, nextCursor } = await order.page(tx, rows, input.limit);

    return { calls: items, nextCursor, totalCount };
  });

/**
 * Whether a call with this customer is the caller's to know of: one of their channels', one they
 * answered, or one on their extension, as the softphone's current call is.
 */
export const hasCallWith = async (tx: Tx, member: PluginMember, customerId: string) => {
  const onTheirPhone = exists(
    tx
      .select({ id: callOperators.id })
      .from(callOperators)
      .where(
        and(
          eq(callOperators.userId, member.userId),
          eq(callOperators.accountId, calls.accountId),
          eq(callOperators.extension, calls.extension),
        ),
      ),
  );

  const theirs = or(
    seenBy(member, conversations.channelId),
    eq(calls.answeredBy, member.userId),
    onTheirPhone,
  );

  const [row] = await callRows(tx, member)
    .where(and(eq(calls.customerId, customerId), theirs))
    .limit(1);

  return Boolean(row);
};

const callById = async (tx: Tx, member: PluginMember, id: string) => {
  const [row] = await callRows(tx, member).where(
    and(eq(calls.id, id), seenBy(member, conversations.channelId)),
  );

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such call' });

  return row;
};

/** One call of the caller's channels, or of the inbox conversation it lives in. */
const get = reads(PERMISSIONS.callView)
  .route({ summary: 'Get one call by its id or by the inbox conversation it belongs to' })
  .input(z.union([z.object({ id: z.string() }), z.object({ conversationId: z.string() })]))
  .output(Call)
  .handler(async ({ input, context: { tx, member } }) => {
    if ('id' in input) return callById(tx, member, input.id);

    const [row] = await callRows(tx, member).where(
      and(eq(calls.conversationId, input.conversationId), seenBy(member, conversations.channelId)),
    );

    if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such call' });

    return row;
  });

/** Asks the PBX for an answered call's recording again, for one it hadn't written yet. */
const fetchRecording = writes(PERMISSIONS.callView)
  .route({ summary: "Ask the PBX again for an answered call's recording, if it isn't saved yet" })
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
