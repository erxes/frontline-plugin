import { randomUUID } from 'node:crypto';
import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { core, INBOX_NOTIFICATIONS, PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { messages } from '#/db/inbox.ts';
import { channelMembers, channels } from '#/db/schema.ts';
import { Attachment, StoredFile } from '#/db/table.ts';
import { logger } from '#/logger.ts';
import { reads, writes } from '#/orpc.ts';
import { holdsEveryPermission } from '../channels/access.ts';
import { notifyMembers } from '../notify.ts';
import { orderOf, PageInput } from '../paging.ts';
import { Content, Html, writtenText } from './html.ts';
import { takeOver } from './operator.ts';
import { messageColumns, postMessage, queueSend } from './post.ts';
import { Reaction, reactionsOf } from './reactions.ts';
import { withoutParts } from './send.ts';
import {
  conversationById,
  conversationLink,
  conversationsFor,
  signalConversations,
  signalMembers,
} from './shared.ts';

export const Message = createSelectSchema(messages, {
  attachments: () => z.array(StoredFile),
}).omit({ orgId: true, providerData: true });

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

const quoted = alias(messages, 'quoted');

/**
 * A conversation's messages, newest first, `limit` at a time; the pinned ones only with `pinned`.
 * `canEdit` marks the caller's own; `reactions` are its emojis; `quotedContent` is the text of
 * the message a reply answers, so a quote shows when that one isn't loaded.
 */
const list = reads(PERMISSIONS.inboxView)
  .input(z.object({ conversationId: z.string(), pinned: z.boolean().default(false), ...PageInput }))
  .output(
    z.object({
      messages: z.array(
        Message.extend({
          canEdit: z.boolean(),
          reactions: z.array(Reaction),
          quotedContent: z.string().nullable(),
        }),
      ),
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
        reactions: reactionsOf(member),
        quotedContent: quoted.content,
      })
      .from(messages)
      .leftJoin(quoted, eq(quoted.id, messages.replyToId))
      .where(
        and(
          eq(messages.conversationId, input.conversationId),
          input.pinned ? isNotNull(messages.pinnedAt) : undefined,
          order.after(input.cursor),
        ),
      )
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const { items, nextCursor } = await order.page(tx, rows, input.limit);

    return { messages: items, nextCursor };
  });

/**
 * The ones of `userIds` who see the channel, so a mention reaches no one else: its members, and
 * Owners and Admins, who see every channel but someone else's personal inbox. When core can't
 * tell roles, only the members stay.
 */
const mentionable = async (tx: Tx, member: PluginMember, channelId: string, userIds: string[]) => {
  const ids = [...new Set(userIds)];

  if (ids.length === 0) return [];

  const [channel] = await tx
    .select({ ownerId: channels.ownerId })
    .from(channels)
    .where(eq(channels.id, channelId));

  const rows = await tx
    .select({ userId: channelMembers.userId })
    .from(channelMembers)
    .where(and(eq(channelMembers.channelId, channelId), inArray(channelMembers.userId, ids)));

  const inIt = rows.map((row) => row.userId);
  const rest = ids.filter((id) => !inIt.includes(id));

  if (rest.length === 0 || channel?.ownerId) return inIt.toSorted();

  const users = await core
    .forOrg(member.orgId)
    .users.list({ ids: rest.join(','), limit: rest.length })
    .catch((error: unknown) => {
      logger.error({ err: error, channelId, userIds: rest }, 'mentioned roles failed');

      return { data: [] };
    });

  const managers = users.data.filter((user) => holdsEveryPermission(user.role));

  return [...inIt, ...managers.map((user) => user.id)].toSorted();
};

/**
 * A member's reply to the customer, or an internal note with `internal`, posted as `postMessage`
 * says: plain `content`, or rich text as `html`. Members it mentions hear of it. It answers
 * `replyToId`, whose text comes back as `quotedContent`.
 */
const create = writes(PERMISSIONS.inboxView)
  .input(
    z.object({
      conversationId: z.string(),
      content: Content.default(''),
      html: Html.optional(),
      attachments: z.array(Attachment).max(20).default([]),
      internal: z.boolean().default(false),
      mentionedUserIds: z.array(z.string()).max(50).default([]),
      replyToId: z.string().nullable().default(null),
    }),
  )
  .output(Message.extend({ quotedContent: z.string().nullable() }))
  .handler(async ({ input, context: { tx, member, afterCommit } }) => {
    const text = writtenText(input);

    if (!text.content && input.attachments.length === 0)
      throw new ORPCError('BAD_REQUEST', { message: 'Write a message or attach a file' });

    const [conversation] = await conversationsFor(tx, member, [input.conversationId]);

    if (!conversation) throw new ORPCError('NOT_FOUND', { message: 'No such conversation' });

    const [answered] = input.replyToId
      ? await tx
          .select({ content: messages.content })
          .from(messages)
          .where(
            and(eq(messages.id, input.replyToId), eq(messages.conversationId, conversation.id)),
          )
      : [];

    if (input.replyToId && !answered)
      throw new ORPCError('BAD_REQUEST', { message: 'Reply to a message of this conversation' });

    const mentionedUserIds = await mentionable(tx, member, conversation.channelId, [
      ...input.mentionedUserIds,
      ...text.mentionedUserIds,
    ]);

    if (!input.internal) await takeOver(tx, [conversation.id]);

    const message = await postMessage(tx, member, conversation, {
      content: text.content,
      html: text.html,
      attachments: input.attachments,
      internal: input.internal,
      mentionedUserIds,
      replyToId: input.replyToId,
    });

    afterCommit(() =>
      notifyMembers(member.orgId, {
        kind: INBOX_NOTIFICATIONS.mentioned,
        title: 'You were mentioned in a conversation',
        link: conversationLink(conversation.id),
        userIds: mentionedUserIds,
        actorUserId: member.userId,
      }),
    );

    return { ...message, quotedContent: answered?.content ?? null };
  });

/** Changes the text of the caller's own message: plain `content`, or rich text as `html`. */
const update = writes(PERMISSIONS.inboxView)
  .input(z.object({ id: z.string(), content: Content.default(''), html: Html.optional() }))
  .output(Message)
  .handler(async ({ input, context: { tx, member } }) => {
    const text = writtenText(input);

    if (!text.content) throw new ORPCError('BAD_REQUEST', { message: 'Write a message' });

    const message = await messageFor(tx, member, input.id);

    if (message.userId !== member.userId)
      throw new ORPCError('FORBIDDEN', { message: 'Only its author can change a message' });

    const [updated] = await tx
      .update(messages)
      .set({
        content: text.content,
        html: text.html,
        editedAt: new Date(),
        providerData: withoutParts,
      })
      .where(eq(messages.id, input.id))
      .returning(messageColumns);

    if (!updated) throw new ORPCError('INTERNAL_SERVER_ERROR');

    const [conversation] = await conversationsFor(tx, member, [message.conversationId]);

    // A note stays in the inbox, so the visitor hears only of a reply.
    await (conversation && !message.internal
      ? signalConversations(tx, member.orgId, [conversation])
      : signalMembers(tx, member.orgId, [message.conversationId]));

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

    await signalMembers(tx, member.orgId, [updated.conversationId]);

    return updated;
  });

/**
 * Sends a reply again that failed, or waited on its send past `SEND_DEADLINE`, as a new job with
 * its own attempts and deadline.
 */
const retry = writes(PERMISSIONS.inboxView)
  .input(z.object({ id: z.string() }))
  .output(Message)
  .handler(async ({ input, context: { tx, member } }) => {
    const message = await messageFor(tx, member, input.id);

    if (message.deliveryStatus !== 'failed')
      throw new ORPCError('CONFLICT', { message: 'Only a reply that failed can be sent again' });

    const [updated] = await tx
      .update(messages)
      .set({ deliveryStatus: 'queued', queuedAt: sql`now()` })
      .where(eq(messages.id, input.id))
      .returning(messageColumns);

    if (!updated) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await queueSend(tx, member.orgId, updated.id, `${updated.id}:${randomUUID()}`);

    const [conversation] = await conversationsFor(tx, member, [message.conversationId]);

    await signalConversations(tx, member.orgId, conversation ? [conversation] : []);

    return updated;
  });

export const messageProcedures = { list, create, update, pin, retry };
