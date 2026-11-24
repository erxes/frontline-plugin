import { bearerOf } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { PLUGIN } from '#/config.ts';
import { MESSAGE_RECEIVED } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import { fail } from '../fail.ts';
import { underKeyLimit } from '../limits.ts';
import { orderOf, PageInput } from '../paging.ts';
import { setOperatorOf } from '../inbox/operator.ts';
import { type Incoming, receive } from '../inbox/receive.ts';
import { typingTopic } from '../inbox/shared.ts';
import { MessengerConfig, messenger } from './adapter.ts';
import { submitToAgent } from '../inbox/agent.ts';
import { faqAnswerTo, postFaqAnswer } from './faq.ts';
import { attachmentsOf, type Visitor, visitorOf } from './session.ts';

/** What a visitor sees of a message: never an internal note or who on the team is who. */
const visitorMessage = {
  id: messages.id,
  conversationId: messages.conversationId,
  content: messages.content,
  attachments: messages.attachments,
  /** What a core agent showed below its answer. */
  blocks: messages.blocks,
  /** A survey the visitor votes on, read from `/surveys/:messageId`. */
  surveyId: messages.surveyId,
  fromVisitor: isNotNull(messages.customerId),
  createdAt: messages.createdAt,
};

const Send = z.object({
  conversationId: z.string().optional(),
  content: z.string().trim().max(10_000).default(''),
  /** The receipts `/files` gave for the visitor's uploads. */
  files: z.array(z.string().max(4000)).max(20).default([]),
});

/** What `/messages` takes from the visitor. */
export type VisitorSend = z.input<typeof Send>;

/** A route whose path names one record by `:id`. */
export const Params = z.object({ id: z.string() });

/** The integration the visitor writes to, with its settings, if it is still an active messenger. */
export const messengerIntegration = (orgId: string, integrationId: string) =>
  withOrg(orgId, async (tx) => {
    const [row] = await tx
      .select({
        name: integrations.name,
        channelId: integrations.channelId,
        config: integrations.config,
      })
      .from(integrations)
      .where(
        and(
          eq(integrations.id, integrationId),
          eq(integrations.kind, messenger.kind),
          eq(integrations.isActive, true),
        ),
      );

    return row
      ? { name: row.name, channelId: row.channelId, ...MessengerConfig.parse(row.config) }
      : null;
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

/** NOT_FOUND unless `id` is a conversation of the visitor's in this messenger. */
const ownConversation = async (tx: Tx, visitor: Visitor, id: string) => {
  const [own] = await tx
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, id),
        eq(conversations.integrationId, visitor.integrationId),
        eq(conversations.customerId, visitor.customerId),
      ),
    );

  if (!own) throw new ORPCError('NOT_FOUND', { message: 'No such conversation' });
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

      if (
        req.method !== 'GET' &&
        !(await underKeyLimit(res, `messenger:${visitor.integrationId}`, 'write'))
      )
        return;

      await handler(visitor, req, res);
    } catch (error) {
      fail(res, error, 'messenger request');
    }
  };

const newestFirst = orderOf(messages);

/** A page of the query's `cursor` and `limit`, as strings in the address. */
const PageQuery = z.object({
  cursor: PageInput.cursor,
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

/**
 * A page of a conversation's messages without internal notes, newest first: the messenger shows
 * the latest and asks for earlier ones with `nextCursor`.
 */
const messagesOf = async (
  tx: Tx,
  conversationId: string,
  { cursor, limit }: z.output<typeof PageQuery>,
) => {
  const rows = await tx
    .select(visitorMessage)
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.internal, false),
        newestFirst.after(cursor),
      ),
    )
    .orderBy(...newestFirst.orderBy)
    .limit(limit + 1);

  return newestFirst.page(tx, rows, limit);
};

/** A page of messages as the visitor sees them. */
export type VisitorMessages = Awaited<ReturnType<typeof messagesOf>>;

/** A message as the visitor sees it. */
export type VisitorMessage = VisitorMessages['items'][number];

/** A conversation of the visitor's, as their messenger lists it. */
export type VisitorConversation = Awaited<ReturnType<typeof visitorConversations>>[number];

const conversationMessages = asVisitor(async (visitor, req, res) => {
  const { id } = Params.parse(req.params);
  const page = PageQuery.parse(req.query);

  const reply: VisitorMessages = await withOrg(visitor.orgId, async (tx) => {
    await ownConversation(tx, visitor, id);

    return messagesOf(tx, id, page);
  });

  res.json(reply);
});

/**
 * The messenger's settings, for a visitor who may write to it: one that requires it takes
 * messages only from a visitor who left an email or phone.
 */
const writableBy = async (visitor: Visitor) => {
  const settings = await messengerIntegration(visitor.orgId, visitor.integrationId);

  if (!settings) throw new ORPCError('NOT_FOUND', { message: 'No such messenger' });

  if (settings.requireAuth && !visitor.identified)
    throw new ORPCError('FORBIDDEN', { message: 'Leave your email or phone number first' });

  return settings;
};

/**
 * Adds the visitor's message and answers it: with `answer`, a common question's, posted as the
 * bot at once, else by the messenger's core agent while the bot has the conversation. Returns
 * the message as the visitor sees it.
 */
const deliver = async (
  visitor: Visitor,
  input: Pick<Incoming, 'conversationId' | 'content' | 'attachments'>,
  answer: string | undefined,
) => {
  const message = await receive(visitor.orgId, {
    ...visitor,
    ...input,
    event: MESSAGE_RECEIVED.messenger.type,
  });

  if (answer === undefined)
    await submitToAgent(visitor.orgId, message, visitor.verified ? visitor.customerId : null);
  else await postFaqAnswer(visitor.orgId, { ...message, customerId: visitor.customerId }, answer);

  const reply: VisitorMessage = {
    id: message.id,
    conversationId: message.conversationId,
    content: message.content,
    attachments: message.attachments,
    blocks: message.blocks,
    surveyId: message.surveyId,
    fromVisitor: true,
    createdAt: message.createdAt,
  };

  return reply;
};

/**
 * The visitor writes, in a conversation of theirs or a new one. A message that asks one of the
 * messenger's common questions exactly gets its saved answer; any other goes to its core agent.
 */
const send = asVisitor(async (visitor, req, res) => {
  const { files, ...input } = Send.parse(req.body);

  if (!input.content && files.length === 0)
    throw new ORPCError('BAD_REQUEST', { message: 'Write a message or attach a file' });

  const attachments = await attachmentsOf(visitor, files);
  const { faq } = await writableBy(visitor);
  const answer = files.length === 0 ? faqAnswerTo(faq, input.content) : undefined;

  res.status(201).json(await deliver(visitor, { ...input, attachments }, answer));
});

/**
 * The visitor taps common question `:id` on the messenger's home screen: it goes in as their
 * message, in their latest conversation that isn't resolved or a new one, and its saved answer
 * follows at once.
 */
const ask = asVisitor(async (visitor, req, res) => {
  const { id } = Params.parse(req.params);
  const entry = (await writableBy(visitor)).faq.find((each) => each.id === id);

  if (!entry) throw new ORPCError('NOT_FOUND', { message: 'No such question' });

  const open = (await visitorConversations(visitor)).find((each) => each.status !== 'resolved');

  const asked = { conversationId: open?.id, content: entry.question };

  res.status(201).json(await deliver(visitor, asked, entry.answer));
});

/**
 * The visitor saw the team's replies so far. Only the messenger's own unread count reads it, so
 * no member's screen hears of it.
 */
const markRead = asVisitor(async (visitor, req, res) => {
  const { id } = Params.parse(req.params);

  await withOrg(visitor.orgId, async (tx) => {
    await ownConversation(tx, visitor, id);
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
  });

  res.status(204).end();
});

/** The visitor is typing: the members with the conversation open see it for a few seconds. */
const typing = asVisitor(async (visitor, req, res) => {
  const { id } = Params.parse(req.params);

  await withOrg(visitor.orgId, async (tx) => {
    await ownConversation(tx, visitor, id);
    await tx.execute(sql`select core_live_signal(${visitor.orgId}, ${PLUGIN}, ${typingTopic(id)})`);
  });

  res.status(204).end();
});

/** The visitor asks for a person: automations stop answering and the team takes over. */
const askForPerson = asVisitor(async (visitor, req, res) => {
  const { id } = Params.parse(req.params);

  await withOrg(visitor.orgId, async (tx) => {
    await ownConversation(tx, visitor, id);

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
  ask,
  markRead,
  typing,
  askForPerson,
};
