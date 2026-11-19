import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, count, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import pLimit from 'p-limit';
import { z } from 'zod';
import { chunks, CONVERSATION_EVENTS, core, INBOX_NOTIFICATIONS, PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import {
  CONVERSATION_STATUSES,
  conversations,
  conversationTags,
  integrations,
  messages,
} from '#/db/inbox.ts';
import { tags } from '#/db/tags.ts';
import { channelMembers } from '#/db/schema.ts';
import { reads, readsWithCore, writes } from '#/orpc.ts';
import { membership, seenBy } from '../channels/access.ts';
import { compileFilter, type FilterFields } from '@erxes/plugin-sdk/filter';
import { FilterInput, filtersBy, likeText } from '../filter.ts';
import { notifyMembers } from '../notify.ts';
import { firstPageCount, orderOf, PageInput, PageOutput } from '../paging.ts';
import {
  Conversation,
  conversationById,
  conversationLink,
  conversationRows,
  conversationsFor,
  Ids,
  publishConversationEvents,
  readSql,
  signalConversations,
  signalMembers,
  tagIdsOf,
} from './shared.ts';

/**
 * What the inbox's filter bar narrows conversations by (`ui/src/modules/inbox/InboxFilter.tsx`),
 * and a report card's filter. The query joins their integration.
 */
export const conversationFilter = (member: PluginMember): FilterFields => ({
  'subject.channelId': { type: 'select', expr: conversations.channelId },
  'subject.integrationId': { type: 'select', expr: conversations.integrationId },
  'subject.kind': { type: 'select', expr: integrations.kind },
  'subject.customerId': { type: 'select', expr: conversations.customerId },
  'subject.status': { type: 'select', expr: conversations.status },
  'subject.assigneeId': { type: 'member', expr: conversations.assigneeId },
  'subject.participantIds': { type: 'member', array: true, expr: conversations.participantIds },
  'subject.mentionedUserIds': { type: 'member', array: true, expr: conversations.mentionedUserIds },
  'subject.tagIds': { type: 'tags', expr: tagIdsOf },
  'subject.isRead': { type: 'boolean', expr: readSql(member) },
  'subject.customerRespondedLast': { type: 'boolean', expr: conversations.customerRespondedLast },
  // The old inbox's automation states: "Automation responded" is a message from neither the
  // customer nor a member, which only the bot writes; "Handed off to operator" is a person's.
  'subject.botReplied': {
    type: 'boolean',
    expr: sql<boolean>`exists (select 1 from ${messages} where ${messages.conversationId} = ${conversations.id}
      and ${messages.customerId} is null and ${messages.userId} is null and not ${messages.internal})`,
  },
  'subject.handedOff': {
    type: 'boolean',
    expr: eq(conversations.operator, 'person'),
  },
  'subject.createdAt': { type: 'date', expr: conversations.createdAt },
  'subject.lastMessageAt': { type: 'date', expr: conversations.lastMessageAt },
  'subject.resolvedAt': { type: 'date', expr: conversations.resolvedAt },
});

const ListInput = z.object({ ...FilterInput, ...PageInput });

/**
 * The conversations the caller sees under the filter bar, before its search: resolved ones only
 * when it asks for a status. The query joins their integration and `membership`.
 */
const shown = (member: PluginMember, filter: z.infer<typeof ListInput>['filter']) =>
  and(
    seenBy(member, conversations.channelId),
    filtersBy(filter, 'subject.status') ? undefined : ne(conversations.status, 'resolved'),
    compileFilter(conversationFilter(member), filter, { me: member.userId }),
  );

/**
 * The ids of the customers whose name, email or phone matches `search`. Core answers 100 at a
 * time, so past 100 matches it is asked about the customers of the conversations `shown`, by
 * id, ten requests at a time.
 */
const customersMatching = async (member: PluginMember, input: z.infer<typeof ListInput>) => {
  const { search } = input;

  if (!search) return [];

  const customers = core.forOrg(member.orgId).customers;
  const first = await customers.list({ search, limit: 100 });

  if (!first.pageInfo.hasNextPage) return first.data.map((customer) => customer.id);

  const theirs = await withOrg(member.orgId, (tx) =>
    tx
      .selectDistinct({ id: conversations.customerId })
      .from(conversations)
      .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
      .leftJoin(channelMembers, membership(member, conversations.channelId))
      .where(shown(member, input.filter)),
  );

  const limit = pLimit(10);

  const pages = await Promise.all(
    chunks(theirs.map((row) => row.id)).map((ids) =>
      limit(() => customers.list({ ids: ids.join(','), search, limit: ids.length })),
    ),
  );

  return pages.flatMap((page) => page.data.map((customer) => customer.id));
};

/**
 * The conversations of the caller's channels, or every channel's for a member who manages them
 * all, latest message first, `limit` at a time, narrowed by the filter bar, and how many match.
 * `search` matches the last message or the customer's name, email or phone; resolved ones show
 * only when the filter asks for a status.
 */
const list = readsWithCore(PERMISSIONS.inboxView, ListInput, customersMatching)
  .output(
    z.object({
      conversations: z.array(Conversation),
      ...PageOutput,
    }),
  )
  .handler(async ({ input, context: { tx, member, fromCore: customerIds } }) => {
    const matches = and(
      shown(member, input.filter),
      input.search
        ? or(
            ilike(conversations.content, likeText(input.search)),
            customerIds.length > 0
              ? sql`${conversations.customerId} = any(${sql.param(customerIds)}::text[])`
              : undefined,
          )
        : undefined,
    );

    const order = orderOf(conversations, conversations.lastMessageAt);

    const rows = await conversationRows(tx, member)
      .where(and(matches, order.after(input.cursor)))
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const totalCount = await firstPageCount(input.cursor, () =>
      tx
        .select({ value: count() })
        .from(conversations)
        .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
        .leftJoin(channelMembers, membership(member, conversations.channelId))
        .where(matches),
    );

    const { items, nextCursor } = await order.page(tx, rows, input.limit);

    return { conversations: items, nextCursor, totalCount };
  });

/** One conversation, for the members of its channel. */
const get = reads(PERMISSIONS.inboxView)
  .input(z.object({ id: z.string() }))
  .output(Conversation)
  .handler(({ input, context: { tx, member } }) => conversationById(tx, member, input.id));

/** Tells the new assignee, after the change committed. */
const notifyAssignee = (member: PluginMember, assigneeId: string, ids: string[]) =>
  notifyMembers(member.orgId, {
    kind: INBOX_NOTIFICATIONS.assigned,
    title:
      ids.length === 1
        ? 'A conversation was assigned to you'
        : 'Conversations were assigned to you',
    link: conversationLink(ids[0] ?? ''),
    userIds: [assigneeId],
    actorUserId: member.userId,
    dedupeKey: `assigned:${assigneeId}:${ids.join(',')}`,
  });

/** Assigns the conversations to a member, or unassigns them with null. */
const assign = writes(PERMISSIONS.inboxView)
  .input(z.object({ ids: Ids, assigneeId: z.string().nullable() }))
  .output(z.array(Conversation))
  .handler(async ({ input, context: { tx, member, afterCommit } }) => {
    const rows = await conversationsFor(tx, member, input.ids);
    const changed = rows.filter((row) => row.assigneeId !== input.assigneeId);
    const { assigneeId } = input;

    if (assigneeId && changed.length > 0)
      afterCommit(() =>
        notifyAssignee(
          member,
          assigneeId,
          changed.map((row) => row.id),
        ),
      );

    if (changed.length > 0) {
      await tx
        .update(conversations)
        .set({ assigneeId: input.assigneeId })
        .where(
          inArray(
            conversations.id,
            changed.map((row) => row.id),
          ),
        );

      await publishConversationEvents(
        tx,
        member.orgId,
        member.userId,
        changed.map((row) => ({
          conversationId: row.id,
          customerId: row.customerId,
          type: CONVERSATION_EVENTS.assigned.type,
          summary: input.assigneeId ? 'Assigned the conversation' : 'Unassigned the conversation',
          payload: { from: row.assigneeId, to: input.assigneeId },
        })),
      );
      await signalMembers(
        tx,
        member.orgId,
        changed.map((row) => row.id),
      );
    }

    return conversationRows(tx, member).where(inArray(conversations.id, input.ids));
  });

/** Moves the conversations to a status. Resolving stamps who and when; reopening clears it. */
const setStatus = writes(PERMISSIONS.inboxView)
  .input(z.object({ ids: Ids, status: z.enum(CONVERSATION_STATUSES) }))
  .output(z.array(Conversation))
  .handler(async ({ input, context: { tx, member } }) => {
    const rows = await conversationsFor(tx, member, input.ids);
    const changed = rows.filter((row) => row.status !== input.status);
    const resolved = input.status === 'resolved';

    if (changed.length > 0) {
      await tx
        .update(conversations)
        .set({
          status: input.status,
          resolvedAt: resolved ? new Date() : null,
          resolvedBy: resolved ? member.userId : null,
        })
        .where(
          inArray(
            conversations.id,
            changed.map((row) => row.id),
          ),
        );

      await publishConversationEvents(
        tx,
        member.orgId,
        member.userId,
        changed.map((row) => ({
          conversationId: row.id,
          customerId: row.customerId,
          type: CONVERSATION_EVENTS.statusChanged.type,
          summary: resolved
            ? 'Resolved the conversation'
            : `Marked the conversation ${input.status}`,
          payload: { from: row.status, to: input.status },
        })),
      );
      await signalConversations(tx, member.orgId, changed);
    }

    return conversationRows(tx, member).where(inArray(conversations.id, input.ids));
  });

/** Marks the conversation read, or unread with `read: false`, for the caller only. */
const markRead = writes(PERMISSIONS.inboxView)
  .input(z.object({ id: z.string(), read: z.boolean().default(true) }))
  .output(Conversation)
  .handler(async ({ input, context: { tx, member } }) => {
    await conversationsFor(tx, member, [input.id]);

    await tx
      .update(conversations)
      .set({
        readBy: input.read
          ? sql`array(select distinct unnest(array_append(${conversations.readBy}, ${member.userId})))`
          : sql`array_remove(${conversations.readBy}, ${member.userId})`,
        updatedAt: sql`${conversations.updatedAt}`,
      })
      .where(eq(conversations.id, input.id));

    return conversationById(tx, member, input.id);
  });

/** Sets each conversation's tags to `tagIds`, each a conversation tag. */
const setTags = writes(PERMISSIONS.inboxView)
  .input(z.object({ ids: Ids, tagIds: z.array(z.string()).max(50) }))
  .output(z.array(Conversation))
  .handler(async ({ input, context: { tx, member } }) => {
    const { ids } = input;

    await conversationsFor(tx, member, ids);

    const tagIds = [...new Set(input.tagIds)];

    if (tagIds.length > 0) {
      const found = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(and(inArray(tags.id, tagIds), eq(tags.type, 'conversation')));

      if (found.length !== tagIds.length)
        throw new ORPCError('BAD_REQUEST', { message: 'Pick conversation tags' });
    }

    await tx.delete(conversationTags).where(inArray(conversationTags.conversationId, ids));

    if (tagIds.length > 0)
      await tx
        .insert(conversationTags)
        .values(
          ids.flatMap((conversationId) =>
            tagIds.map((tagId) => ({ orgId: member.orgId, conversationId, tagId })),
          ),
        );

    await signalMembers(tx, member.orgId, ids);

    return conversationRows(tx, member).where(inArray(conversations.id, ids));
  });

export const conversationProcedures = {
  list,
  get,
  assign,
  setStatus,
  markRead,
  setTags,
};
