import { randomUUID } from 'node:crypto';
import { ORPCError } from '@orpc/server';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { BrowserInfo } from '#/db/messenger.ts';
import { logger } from '#/logger.ts';
import { fail } from '../fail.ts';
import { customerFor } from '../inbox/receive.ts';
import { voteRoutes } from '../surveys/votes.ts';
import { isOnlineAt, messenger } from './adapter.ts';
import { messengerOf, tokenOf, visitorOf } from './session.ts';
import { streaming, subscribe } from './stream.ts';
import { asVisitor, messengerIntegration, threadRoutes, visitorConversations } from './threads.ts';
import {
  identify,
  Identity,
  recordVisit,
  saveVisitorData,
  setOnline,
  supportersOf,
  VisitorData,
} from './visitors.ts';

const Connect = VisitorData.extend({
  key: z.string().min(1).max(200),
  token: z.string().optional(),
  /** The visitor's email or phone, when they leave one. */
  identity: Identity.optional(),
  browser: BrowserInfo.optional(),
});

/**
 * A visitor opens the messenger with its integration's key, and gets back a signed token that
 * names them, the messenger's settings, its team and their conversations. A token for this
 * messenger keeps its visitor; without one, the visitor becomes a new core lead, linked by a
 * visitor id only the server makes. An email or phone makes them the core customer that has it.
 */
const connect = async (req: Request, res: Response) => {
  try {
    const input = Connect.parse(req.body);
    const found = await messengerOf(input.key);
    const settings = found && (await messengerIntegration(found.orgId, found.integrationId));

    if (!found || !settings) throw new ORPCError('NOT_FOUND', { message: 'No such messenger' });

    const known = await visitorOf(input.token);
    const kept = known?.orgId === found.orgId && known.integrationId === found.integrationId;

    const anonymous = kept
      ? known
      : {
          ...found,
          identified: false,
          owns: true,
          customerId: await customerFor(found.orgId, {
            source: messenger.kind,
            externalId: randomUUID(),
            firstName: 'Visitor',
          }),
        };

    const visitor = input.identity ? await identify(anonymous, input.identity) : anonymous;

    await recordVisit(visitor, { browser: input.browser, remoteAddress: req.ip }, true);
    await saveVisitorData(visitor, input);

    const { supporterIds, ...shown } = settings;

    res.json({
      token: visitor === known ? input.token : await tokenOf(visitor),
      identified: visitor.identified,
      messenger: {
        ...shown,
        isOnline: isOnlineAt(settings, new Date()),
        supporters: await supportersOf(found.orgId, supporterIds),
      },
      conversations: await visitorConversations(visitor),
    });
  } catch (error) {
    fail(res, error, 'messenger connect');
  }
};

/** The page and browser the visitor is on now, as the widget reports each page view. */
const browserInfo = asVisitor(async (visitor, req, res) => {
  await recordVisit(
    visitor,
    { browser: BrowserInfo.parse(req.body), remoteAddress: req.ip },
    false,
  );

  res.status(204).end();
});

/**
 * Server-sent events: `changed` for each conversation of the visitor that changes, so the
 * messenger refetches it, and `typing` while a member writes in one. The visitor reads as online
 * while a stream is open. An EventSource can't send headers, so the token is in the address.
 */
const stream = async (req: Request, res: Response) => {
  try {
    const visitor = await visitorOf(z.string().optional().parse(req.query.token));

    if (!visitor) {
      res.status(401).json({ message: 'Connect to the messenger first' });

      return;
    }

    const stop = await subscribe(visitor.orgId, visitor.customerId, ({ conversationId, event }) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify({ conversationId })}\n\n`);
    });

    await setOnline(visitor, true);

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

      if (!streaming(visitor.orgId, visitor.customerId))
        void setOnline(visitor, false).catch((error: unknown) => {
          logger.error({ err: error, customerId: visitor.customerId }, 'visitor offline failed');
        });
    });
  } catch (error) {
    fail(res, error, 'messenger stream');
  }
};

/** The website messenger's signed-out API at `/api/public/messenger`. */
export const messengerRoutes = () => {
  const router = express.Router();

  // Websites embed the messenger, so any origin calls it; the token, not a cookie, is the visitor.
  router.use(cors({ origin: '*', maxAge: 600 }));
  router.use(express.json({ limit: '64kb' }));
  router.post('/connect', connect);
  router.post('/browser', browserInfo);
  router.get('/conversations', threadRoutes.conversations);
  router.get('/conversations/:id/messages', threadRoutes.conversationMessages);
  router.post('/messages', threadRoutes.send);
  router.post('/conversations/:id/read', threadRoutes.markRead);
  router.post('/conversations/:id/typing', threadRoutes.typing);
  router.post('/conversations/:id/person', threadRoutes.askForPerson);
  router.get('/surveys/:messageId', voteRoutes.read);
  router.post('/surveys/:messageId/votes', voteRoutes.vote);
  router.get('/stream', stream);

  return router;
};
