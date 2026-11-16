import { bearerOf } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PLUGIN } from '#/config.ts';
import { withOrg } from '#/db/client.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import { Attachment } from '#/db/table.ts';
import { fail } from '../fail.ts';
import { setOperatorOf } from '../inbox/operator.ts';
import { receive } from '../inbox/receive.ts';
import { signalConversations, typingTopic } from '../inbox/shared.ts';
import { MessengerConfig, messenger } from './adapter.ts';
import { type Visitor, visitorOf } from './session.ts';

/** What a visitor sees of a message: never an internal note or who on the team is who. */
const visitorMessage = {
  id: messages.id,
  conversationId: messages.conversationId,
  content: messages.content,
  attachments: messages.attachments,
  fromVisitor: isNotNull(messages.customerId),
  createdAt: messages.createdAt,
};

const Send = z.object({
  conversationId: z.string().optional(),
  content: z.string().trim().max(10_000).default(''),
  attachments: z.array(Attachment).max(20).default([]),
});

const Params = z.object({ id: z.string() });

/** The integration the visitor writes to, with its settings, if it is still an active messenger. */
export const messengerIntegration = (orgId: string, integrationId: string) =>
  withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select({ name: integrations.name, config: integrations.config })
      .from(integrations)
      .where(
        and(
          eq(integrations.id, integrationId),
          eq(integrations.kind, messenger.kind),
          eq(integrations.isActive, true),
        ),
      );

    return row ? { name: row.name, ...MessengerConfig.parse(row.config) } : null;
  });

/**
 * The team's replies the visitor hasn't read yet in the conversation. Written with an alias: a
 * one-table select leaves Drizzle's column names unqualified, which the subquery would misread.
 */
const unreadCount = sql<number>`(
  select count(*)::int from ${messages} reply
  where reply.conversation_id = ${conversations}.id
    and reply.customer_id is null
    and not reply.internal
    and reply.customer_read_at is null
)`;

/** The visitor's conversations in this messenger, latest first, each with its unread replies. */
export const visitorConversations = (visitor: Visitor) =>
  withOrg(visitor.orgId, (tx) =>
    tx
      .select({
        id: conversations.id,
        status: conversations.status,
        operator: conversations.operator,
        content: conversations.content,
        lastMessageAt: conversations.lastMessageAt,
        unreadCount,
      })
      .from(conversations)
      .where(
        and(
          eq(conversations.integrationId, visitor.integrationId),
          eq(conversations.customerId, visitor.customerId),
        ),
      )
      .orderBy(desc(conversations.lastMessageAt)),
  );

/** The visitor's conversation `id`, locked, or NOT_FOUND. */
const ownConversation = async (visitor: Visitor, id: string) => {
  const own = await visitorConversations(visitor);

  if (!own.some((conversation) => conversation.id === id))
    throw new ORPCError('NOT_FOUND', { message: 'No such conversation' });
};

/** Runs `handler` for the visitor the bearer token names, answering 401 without one and the status of a refusal. */
export const asVisitor =
  (handler: (visitor: Visitor, req: Request, res: Response) => Promise<void>) =>
  async (req: Request, res: Response) => {
    try {
      const visitor = await visitorOf(bearerOf(req.headers.authorization) ?? undefined);

      if (!visitor) {
        res.status(401).json({ message: 'Connect to the messenger first' });

        return;
      }

      await handler(visitor, req, res);
    } catch (error) {
      fail(res, error, 'messenger request');
    }
  };

/** A conversation's messages, oldest first, without internal notes. */
const conversationMessages = asVisitor(async (visitor, req, res) => {
  const { id } = Params.parse(req.params);

  await ownConversation(visitor, id);

  res.json(
    await withOrg(visitor.orgId, (tx) =>
      tx
        .select(visitorMessage)
        .from(messages)
        .where(and(eq(messages.conversationId, id), eq(messages.internal, false)))
        .orderBy(asc(messages.createdAt), asc(messages.id)),
    ),
  );
});

/**
 * The visitor writes, in a conversation of theirs or a new one. A messenger that requires it
 * takes messages only from a visitor who left an email or phone.
 */
const send = asVisitor(async (visitor, req, res) => {
  const input = Send.parse(req.body);

  if (!input.content && input.attachments.length === 0)
    throw new ORPCError('BAD_REQUEST', { message: 'Write a message or attach a file' });

  const settings = await messengerIntegration(visitor.orgId, visitor.integrationId);

  if (settings?.requireAuth && !visitor.identified)
    throw new ORPCError('FORBIDDEN', { message: 'Leave your email or phone number first' });

  const message = await receive(visitor.orgId, { ...visitor, ...input });

  res.status(201).json({
    id: message.id,
    conversationId: message.conversationId,
    content: message.content,
    attachments: message.attachments,
    fromVisitor: true,
    createdAt: message.createdAt,
  });
});

/** The visitor saw the team's replies so far. */
const markRead = asVisitor(async (visitor, req, res) => {
  const { id } = Params.parse(req.params);

  await ownConversation(visitor, id);
  await withOrg(visitor.orgId, async (tx) => {
    await tx
      .update(messages)
      .set({ customerReadAt: new Date() })
      .where(
        and(
          eq(messages.conversationId, id),
          isNull(messages.customerReadAt),
          isNull(messages.customerId),
          eq(messages.internal, false),
        ),
      );
    await signalConversations(tx, visitor.orgId, []);
  });

  res.status(204).end();
});

/** The visitor is typing: the members with the conversation open see it for a few seconds. */
const typing = asVisitor(async (visitor, req, res) => {
  const { id } = Params.parse(req.params);

  await ownConversation(visitor, id);
  await withOrg(visitor.orgId, (tx) =>
    tx.execute(sql`select core_live_signal(${visitor.orgId}, ${PLUGIN}, ${typingTopic(id)})`),
  );

  res.status(204).end();
});

/** The visitor asks for a person: automations stop answering and the team takes over. */
const askForPerson = asVisitor(async (visitor, req, res) => {
  const { id } = Params.parse(req.params);

  await ownConversation(visitor, id);
  await withOrg(visitor.orgId, async (tx) => {
    const rows = await tx
      .select({
        id: conversations.id,
        customerId: conversations.customerId,
        operator: conversations.operator,
      })
      .from(conversations)
      .where(eq(conversations.id, id))
      .for('update');

    await setOperatorOf(tx, visitor.orgId, rows, 'person');
  });

  res.status(204).end();
});

/** A visitor's conversations and messages, under `/api/public/messenger`. */
export const threadRoutes = {
  conversations: asVisitor(async (visitor, _req, res) => {
    res.json(await visitorConversations(visitor));
  }),
  conversationMessages,
  send,
  markRead,
  typing,
  askForPerson,
};
