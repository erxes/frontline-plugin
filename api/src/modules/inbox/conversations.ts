import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, count, eq, ilike, inArray, ne, sql } from 'drizzle-orm';
import { z } from 'zod';
import { CONVERSATION_EVENTS, core, INBOX_NOTIFICATIONS, PERMISSIONS } from '#/core.ts';
import {
  CONVERSATION_STATUSES,
  conversations,
  conversationTags,
  integrations,
} from '#/db/inbox.ts';
import { tags } from '#/db/tags.ts';
import { channelMembers } from '#/db/schema.ts';
import { logger } from '#/logger.ts';
import { reads, writes } from '#/orpc.ts';
import { membership } from '../channels/access.ts';
import { FilterInput, type FilterFields, filtersBy, filterSql, likeText } from '../filter.ts';
import { orderOf, PageInput, pageOf } from '../paging.ts';
import {
  Conversation,
  conversationById,
  conversationRows,
  conversationsFor,
  Ids,
  mentionedIdsOf,
  publishConversationEvents,
  readSql,
  seenBy,
  signalConversations,
  tagIdsOf,
} from './shared.ts';

/** What the inbox's filter bar narrows conversations by (`ui/src/modules/inbox/InboxFilter.tsx`). */
const filterFields = (member: PluginMember): FilterFields => ({
  'subject.channelId': { kind: 'select', expr: conversations.channelId },
  'subject.integrationId': { kind: 'select', expr: conversations.integrationId },
  'subject.kind': { kind: 'select', expr: integrations.kind },
  'subject.status': { kind: 'select', expr: conversations.status },
  'subject.assigneeId': { kind: 'member', expr: conversations.assigneeId },
  'subject.participantIds': { kind: 'members', expr: conversations.participantIds },
  'subject.mentionedUserIds': { kind: 'members', expr: mentionedIdsOf },
  'subject.tagIds': { kind: 'members', expr: tagIdsOf },
  'subject.isRead': { kind: 'boolean', expr: readSql(member) },
  'subject.customerRespondedLast': { kind: 'boolean', expr: conversations.customerRespondedLast },
  'subject.createdAt': { kind: 'date', expr: conversations.createdAt },
  'subject.lastMessageAt': { kind: 'date', expr: conversations.lastMessageAt },
  'subject.resolvedAt': { kind: 'date', expr: conversations.resolvedAt },
});

/**
 * The conversations of the caller's channels, or every channel's for a member who manages them
 * all, latest message first, `limit` at a time, narrowed by the filter bar, and how many match.
 * `search` matches the last message; resolved ones show only when the filter asks for a status.
 */
const list = reads(PERMISSIONS.inboxView)
  .input(z.object({ ...FilterInput, ...PageInput }))
  .output(
    z.object({
      conversations: z.array(Conversation),
      nextCursor: z.string().nullable(),
      totalCount: z.number(),
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    const matches = and(
      seenBy(member),
      filtersBy(input.filter, 'subject.status') ? undefined : ne(conversations.status, 'resolved'),
      input.search ? ilike(conversations.content, likeText(input.search)) : undefined,
      input.filter ? filterSql(filterFields(member), input.filter, member.userId) : undefined,
    );

    const order = orderOf(conversations, conversations.lastMessageAt);

    const rows = await conversationRows(tx, member)
      .where(and(matches, order.after(input.cursor)))
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const [total] = await tx
      .select({ value: count() })
      .from(conversations)
      .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
      .leftJoin(channelMembers, membership(member, conversations.channelId))
      .where(matches);

    const { items, nextCursor } = pageOf(rows, input.limit);

    return { conversations: items, nextCursor, totalCount: total?.value ?? 0 };
  });

/** One conversation, for the members of its channel. */
const get = reads(PERMISSIONS.inboxView)
  .input(z.object({ id: z.string() }))
  .output(Conversation)
  .handler(({ input, context: { tx, member } }) => conversationById(tx, member, input.id));

/** Tells the new assignee, after the change committed; a failed notification is logged, not thrown. */
const notifyAssignee = async (member: PluginMember, assigneeId: string, ids: string[]) => {
  if (assigneeId === member.userId) return;

  await core
    .forOrg(member.orgId)
    .notifications.create({
      kind: INBOX_NOTIFICATIONS.assigned,
      title:
        ids.length === 1
          ? 'A conversation was assigned to you'
          : `${ids.length} conversations were assigned to you`,
      link: `/frontline/inbox?conversationId=${encodeURIComponent(ids[0] ?? '')}`,
      userIds: [assigneeId],
      actorUserId: member.userId,
      dedupeKey: `assigned:${assigneeId}:${ids.join(',')}`,
    })
    .catch((error: unknown) => {
      logger.error({ err: error, assigneeId, ids }, 'assignment notification failed');
    });
};

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
      await signalConversations(tx, member.orgId, []);
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

/** Sets the conversation's tags to `tagIds`, each a conversation tag. */
const setTags = writes(PERMISSIONS.inboxView)
  .input(z.object({ id: z.string(), tagIds: z.array(z.string()).max(50) }))
  .output(Conversation)
  .handler(async ({ input, context: { tx, member } }) => {
    await conversationsFor(tx, member, [input.id]);

    const tagIds = [...new Set(input.tagIds)];

    if (tagIds.length > 0) {
      const found = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(and(inArray(tags.id, tagIds), eq(tags.type, 'conversation')));

      if (found.length !== tagIds.length)
        throw new ORPCError('BAD_REQUEST', { message: 'Pick conversation tags' });
    }

    await tx.delete(conversationTags).where(eq(conversationTags.conversationId, input.id));

    if (tagIds.length > 0)
      await tx
        .insert(conversationTags)
        .values(tagIds.map((tagId) => ({ orgId: member.orgId, conversationId: input.id, tagId })));

    await signalConversations(tx, member.orgId, []);

    return conversationById(tx, member, input.id);
  });

export const conversationProcedures = {
  list,
  get,
  assign,
  setStatus,
  markRead,
  setTags,
};
