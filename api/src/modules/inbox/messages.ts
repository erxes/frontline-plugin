import type { PluginMember } from '@erxes/plugin-sdk';
import { enqueueJob } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, eq, getTableColumns, isNotNull, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { core, INBOX_NOTIFICATIONS, JOBS, PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import { Attachment } from '#/db/table.ts';
import { logger } from '#/logger.ts';
import { reads, writes } from '#/orpc.ts';
import { orderOf, PageInput, pageOf } from '../paging.ts';
import { ADAPTERS } from './adapters.ts';
import { conversationById, conversationsFor, signalConversations } from './shared.ts';

/** The row without `org_id`, which the caller already knows. */
const { orgId, providerData, ...messageColumns } = getTableColumns(messages);

export const Message = createSelectSchema(messages, {
  attachments: () => z.array(Attachment),
}).omit({ orgId: true, providerData: true });

const Content = z.string().trim().max(10_000);

/** The message `id` of a conversation the caller sees, locked, or NOT_FOUND. */
const messageFor = async (tx: Tx, member: PluginMember, id: string) => {
  const [message] = await tx
    .select(messageColumns)
    .from(messages)
    .where(eq(messages.id, id))
    .for('update');

  if (!message) throw new ORPCError('NOT_FOUND', { message: 'No such message' });

  await conversationsFor(tx, member, [message.conversationId]);

  return message;
};

/**
 * A conversation's messages, newest first, `limit` at a time; the pinned ones only with `pinned`.
 * `canEdit` marks the caller's own.
 */
const list = reads(PERMISSIONS.inboxView)
  .input(z.object({ conversationId: z.string(), pinned: z.boolean().default(false), ...PageInput }))
  .output(
    z.object({
      messages: z.array(Message.extend({ canEdit: z.boolean() })),
      nextCursor: z.string().nullable(),
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    await conversationById(tx, member, input.conversationId);

    const order = orderOf(messages);

    const rows = await tx
      .select({
        ...messageColumns,
        canEdit: sql<boolean>`coalesce(${messages.userId} = ${member.userId}, false)`,
      })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, input.conversationId),
          input.pinned ? isNotNull(messages.pinnedAt) : undefined,
          order.after(input.cursor),
        ),
      )
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const { items, nextCursor } = pageOf(rows, input.limit);

    return { messages: items, nextCursor };
  });

/** Tells the mentioned members, after the message committed; a failure is logged, not thrown. */
const notifyMentioned = async (member: PluginMember, conversationId: string, userIds: string[]) => {
  const others = userIds.filter((id) => id !== member.userId);

  if (others.length === 0) return;

  await core
    .forOrg(member.orgId)
    .notifications.create({
      kind: INBOX_NOTIFICATIONS.mentioned,
      title: 'You were mentioned in a conversation',
      link: `/frontline/inbox?conversationId=${encodeURIComponent(conversationId)}`,
      userIds: others,
      actorUserId: member.userId,
    })
    .catch((error: unknown) => {
      logger.error({ err: error, conversationId, userIds: others }, 'mention notification failed');
    });
};

/**
 * A member's reply to the customer, or an internal note with `internal`. A reply waits on its
 * adapter's `send` as a queued job, or is sent once it commits when the adapter has none; the
 * conversation leaves `new` and stops waiting on a reply. A note only adds the caller to the
 * conversation's participants. Mentioned members hear of it.
 */
const create = writes(PERMISSIONS.inboxView)
  .input(
    z
      .object({
        conversationId: z.string(),
        content: Content.default(''),
        attachments: z.array(Attachment).max(20).default([]),
        internal: z.boolean().default(false),
        mentionedUserIds: z.array(z.string()).max(50).default([]),
        replyToId: z.string().nullable().default(null),
      })
      .refine((input) => input.content || input.attachments.length > 0, {
        message: 'Write a message or attach a file',
        path: ['content'],
      }),
  )
  .output(Message)
  .handler(async ({ input, context: { tx, member, afterCommit } }) => {
    const [conversation] = await conversationsFor(tx, member, [input.conversationId]);

    if (!conversation) throw new ORPCError('NOT_FOUND', { message: 'No such conversation' });

    const [integration] = await tx
      .select({ kind: integrations.kind })
      .from(integrations)
      .where(eq(integrations.id, conversation.integrationId));

    if (input.replyToId) {
      const [quoted] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.id, input.replyToId), eq(messages.conversationId, conversation.id)));

      if (!quoted)
        throw new ORPCError('BAD_REQUEST', { message: 'Reply to a message of this conversation' });
    }

    const queued = !input.internal && Boolean(ADAPTERS.get(integration?.kind ?? '')?.send);

    const [message] = await tx
      .insert(messages)
      .values({
        ...input,
        orgId: member.orgId,
        userId: member.userId,
        deliveryStatus: input.internal ? null : queued ? 'queued' : 'sent',
      })
      .returning(messageColumns);

    if (!message) throw new ORPCError('INTERNAL_SERVER_ERROR');

    const participants = sql`array(select distinct unnest(array_append(${conversations.participantIds}, ${member.userId})))`;

    await tx
      .update(conversations)
      .set(
        input.internal
          ? { participantIds: participants }
          : {
              participantIds: participants,
              content: input.content,
              messageCount: sql`${conversations.messageCount} + 1`,
              lastMessageAt: message.createdAt,
              customerRespondedLast: false,
              readBy: sql`array(select distinct unnest(array_append(${conversations.readBy}, ${member.userId})))`,
              status: sql`case when ${conversations.status} = 'new' then 'open' else ${conversations.status} end`,
              firstRespondedAt: sql`coalesce(${conversations.firstRespondedAt}, now())`,
              firstRespondedBy: sql`coalesce(${conversations.firstRespondedBy}, ${member.userId})`,
            },
      )
      .where(eq(conversations.id, conversation.id));

    if (queued)
      await enqueueJob(tx, {
        orgId: member.orgId,
        name: JOBS.send.name,
        payload: { messageId: message.id },
        dedupeKey: message.id,
      });

    await signalConversations(tx, member.orgId, input.internal ? [] : [conversation]);

    afterCommit(() => notifyMentioned(member, conversation.id, input.mentionedUserIds));

    return message;
  });

/** Changes the text of the caller's own message. */
const update = writes(PERMISSIONS.inboxView)
  .input(z.object({ id: z.string(), content: Content.min(1) }))
  .output(Message)
  .handler(async ({ input, context: { tx, member } }) => {
    const message = await messageFor(tx, member, input.id);

    if (message.userId !== member.userId)
      throw new ORPCError('FORBIDDEN', { message: 'Only its author can change a message' });

    const [updated] = await tx
      .update(messages)
      .set({ content: input.content, editedAt: new Date() })
      .where(eq(messages.id, input.id))
      .returning(messageColumns);

    if (!updated) throw new ORPCError('INTERNAL_SERVER_ERROR');

    const [conversation] = await conversationsFor(tx, member, [message.conversationId]);

    await signalConversations(
      tx,
      member.orgId,
      conversation && !message.internal ? [conversation] : [],
    );

    return updated;
  });

/** Pins a message to the top of its conversation, or unpins it with `pinned: false`. */
const pin = writes(PERMISSIONS.inboxView)
  .input(z.object({ id: z.string(), pinned: z.boolean().default(true) }))
  .output(Message)
  .handler(async ({ input, context: { tx, member } }) => {
    await messageFor(tx, member, input.id);

    const [updated] = await tx
      .update(messages)
      .set(
        input.pinned
          ? { pinnedAt: new Date(), pinnedBy: member.userId }
          : { pinnedAt: null, pinnedBy: null },
      )
      .where(eq(messages.id, input.id))
      .returning(messageColumns);

    if (!updated) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await signalConversations(tx, member.orgId, []);

    return updated;
  });

export const messageProcedures = { list, create, update, pin };
