import { randomUUID } from 'node:crypto';
import { bearerOf } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { withOrg } from '#/db/client.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import { Attachment } from '#/db/table.ts';
import { logger } from '#/logger.ts';
import { customerFor, receive } from '../inbox/receive.ts';
import { signalConversations } from '../inbox/shared.ts';
import { MessengerConfig, messenger } from './adapter.ts';
import { messengerOf, tokenOf, type Visitor, visitorOf } from './session.ts';
import { subscribe } from './stream.ts';

/** What a visitor sees of a message: never an internal note or who on the team is who. */
const visitorMessage = {
  id: messages.id,
  conversationId: messages.conversationId,
  content: messages.content,
  attachments: messages.attachments,
  fromVisitor: isNotNull(messages.customerId),
  createdAt: messages.createdAt,
};

const Connect = z.object({ key: z.string().min(1).max(200), token: z.string().optional() });

const Send = z.object({
  conversationId: z.string().optional(),
  content: z.string().trim().max(10_000).default(''),
  attachments: z.array(Attachment).max(20).default([]),
});

/** The integration the visitor writes to, if it is still an active messenger. */
const messengerIntegration = (orgId: string, integrationId: string) =>
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

const visitorConversations = (visitor: Visitor) =>
  withOrg(visitor.orgId, (tx) =>
    tx
      .select({
        id: conversations.id,
        status: conversations.status,
        content: conversations.content,
        lastMessageAt: conversations.lastMessageAt,
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

/** The visitor's conversation `id`, or NOT_FOUND. */
const ownConversation = async (visitor: Visitor, id: string) => {
  const own = await visitorConversations(visitor);

  if (!own.some((conversation) => conversation.id === id))
    throw new ORPCError('NOT_FOUND', { message: 'No such conversation' });
};

/** Answers a refused request with its status, or 500 for anything unexpected. */
const fail = (res: Response, error: unknown) => {
  if (error instanceof ORPCError) {
    res.status(error.status).json({ message: error.message });

    return;
  }

  if (error instanceof z.ZodError) {
    res.status(400).json({ message: z.prettifyError(error) });

    return;
  }

  logger.error({ err: error }, 'messenger request failed');
  res.status(500).json({ message: 'Something went wrong' });
};

/** Runs `handler` for the visitor the bearer token names, answering 401 without one and the status of a refusal. */
const asVisitor =
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
      fail(res, error);
    }
  };

/**
 * A visitor opens the messenger with its integration's key, and gets back a signed token that
 * names them. A token for this messenger keeps its visitor; without one, the visitor becomes a
 * new core lead, linked by a visitor id only the server makes.
 */
const connect = async (req: Request, res: Response) => {
  try {
    const input = Connect.parse(req.body);
    const found = await messengerOf(input.key);
    const settings = found && (await messengerIntegration(found.orgId, found.integrationId));

    if (!found || !settings) throw new ORPCError('NOT_FOUND', { message: 'No such messenger' });

    const known = await visitorOf(input.token);

    const visitor =
      known?.orgId === found.orgId && known.integrationId === found.integrationId
        ? known
        : {
            ...found,
            customerId: await customerFor(found.orgId, {
              source: messenger.kind,
              externalId: randomUUID(),
              firstName: 'Visitor',
            }),
          };

    res.json({
      token: known === visitor ? input.token : await tokenOf(visitor),
      messenger: settings,
      conversations: await visitorConversations(visitor),
    });
  } catch (error) {
    fail(res, error);
  }
};

const Params = z.object({ id: z.string() });

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

/** The visitor writes, in a conversation of theirs or a new one. */
const send = asVisitor(async (visitor, req, res) => {
  const input = Send.parse(req.body);

  if (!input.content && input.attachments.length === 0)
    throw new ORPCError('BAD_REQUEST', { message: 'Write a message or attach a file' });

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

/**
 * Server-sent events: a `changed` event for each conversation of the visitor that changes, so
 * the messenger refetches it. An EventSource can't send headers, so the token is in the address.
 */
const stream = async (req: Request, res: Response) => {
  try {
    const visitor = await visitorOf(z.string().optional().parse(req.query.token));

    if (!visitor) {
      res.status(401).json({ message: 'Connect to the messenger first' });

      return;
    }

    const stop = await subscribe(visitor.orgId, visitor.customerId, (conversationId) => {
      res.write(`event: changed\ndata: ${JSON.stringify({ conversationId })}\n\n`);
    });

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(': connected\n\n');

    // A comment every 25 s keeps proxies from closing a quiet stream.
    const beat = setInterval(() => res.write(': ping\n\n'), 25_000);

    req.on('close', () => {
      clearInterval(beat);
      stop();
    });
  } catch (error) {
    fail(res, error);
  }
};

/** The website messenger's signed-out API at `/api/public/messenger`. */
export const messengerRoutes = () => {
  const router = express.Router();

  // Websites embed the messenger, so any origin calls it; the token, not a cookie, is the visitor.
  router.use(cors({ origin: '*', maxAge: 600 }));
  router.use(express.json({ limit: '64kb' }));
  router.post('/connect', connect);
  router.get(
    '/conversations',
    asVisitor(async (visitor, _req, res) => {
      res.json(await visitorConversations(visitor));
    }),
  );
  router.get('/conversations/:id/messages', conversationMessages);
  router.post('/messages', send);
  router.post('/conversations/:id/read', markRead);
  router.get('/stream', stream);

  return router;
};
