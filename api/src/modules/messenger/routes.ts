import { randomUUID } from 'node:crypto';
import { ORPCError } from '@orpc/server';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { BrowserInfo } from '#/db/messenger.ts';
import { logger } from '#/logger.ts';
import { fail } from '../fail.ts';
import { customerFor } from '../inbox/receive.ts';
import { isOnlineAt, messenger } from './adapter.ts';
import { articleRoutes } from './articles.ts';
import { fileRoutes } from './files.ts';
import { messengerOf, tokenOf, visitorOf } from './session.ts';
import { streaming, subscribe } from './stream.ts';
import { ticketRoutes } from './tickets.ts';
import { asVisitor, messengerIntegration, threadRoutes, visitorConversations } from './threads.ts';
import { identify, Identity, recordVisit, setOnline, supportersOf } from './visitors.ts';

const Connect = z.object({
  key: z.string().min(1).max(200),
  token: z.string().optional(),
  /** The visitor's email or phone, when they leave one. */
  identity: Identity.optional(),
  browser: BrowserInfo.optional(),
});

export type { VisitorConversation, VisitorMessage } from './threads.ts';

export type { TicketForms, VisitorTicket } from './tickets.ts';

/** The active messenger a key opens, with its settings, or NOT_FOUND. */
const opened = async (key: string) => {
  const found = await messengerOf(key);
  const settings = found && (await messengerIntegration(found.orgId, found.integrationId));

  if (!found || !settings) throw new ORPCError('NOT_FOUND', { message: 'No such messenger' });

  return { ...found, settings };
};

/**
 * What a visitor sees of the messenger: its settings with its team in place of the team's ids,
 * whether that team is online now, and whether it takes tickets.
 */
const messengerView = async ({ orgId, settings }: Awaited<ReturnType<typeof opened>>) => {
  const { supporterIds, channelId, ticketPipelineIds, ...shown } = settings;

  return {
    ...shown,
    isOnline: isOnlineAt(settings, new Date()),
    supporters: await supportersOf(orgId, supporterIds),
    tickets: ticketPipelineIds.length > 0,
  };
};

/** What `/connect` answers, as the widget reads it. */
export type Connected = {
  token: string;
  identified: boolean;
  messenger: Awaited<ReturnType<typeof messengerView>>;
  conversations: Awaited<ReturnType<typeof visitorConversations>>;
};

/**
 * A visitor opens the messenger with its integration's key, and gets back a signed token that
 * names them, the messenger's settings, its team and their conversations. A token for this
 * messenger keeps its visitor; without one, the visitor becomes a new core lead, linked by a
 * visitor id only the server makes. An email or phone makes them the core customer that has it.
 */
const connect = async (req: Request, res: Response) => {
  try {
    const input = Connect.parse(req.body);
    const shown = await opened(input.key);
    const found = { orgId: shown.orgId, integrationId: shown.integrationId };

    const known = await visitorOf(input.token);
    const kept = known?.orgId === found.orgId && known.integrationId === found.integrationId;

    const anonymous = kept
      ? known
      : {
          ...found,
          identified: false,
          customerId: await customerFor(found.orgId, {
            source: messenger.kind,
            externalId: randomUUID(),
            firstName: 'Visitor',
          }),
        };

    const visitor = input.identity ? await identify(anonymous, input.identity) : anonymous;

    await recordVisit(visitor, { browser: input.browser, remoteAddress: req.ip }, true);

    const reply: Connected = {
      token: visitor === known && input.token ? input.token : await tokenOf(visitor),
      identified: visitor.identified,
      messenger: await messengerView(shown),
      conversations: await visitorConversations(visitor),
    };

    res.json(reply);
  } catch (error) {
    fail(res, error, 'messenger connect');
  }
};

/**
 * What the messenger shows before anyone writes, by its key: the launcher and greeting need no
 * visitor, so a page view makes no core customer until the visitor opens the messenger.
 */
const settings = async (req: Request, res: Response) => {
  try {
    const key = Connect.shape.key.parse(req.query.key);

    const reply: Pick<Connected, 'messenger'> = {
      messenger: await messengerView(await opened(key)),
    };

    res.set('cache-control', 'public, max-age=60').json(reply);
  } catch (error) {
    fail(res, error, 'messenger settings');
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
  router.use('/files', fileRoutes());
  router.use(express.json({ limit: '64kb' }));
  router.get('/settings', settings);
  router.post('/connect', connect);
  router.post('/browser', browserInfo);
  router.get('/conversations', threadRoutes.conversations);
  router.get('/conversations/:id/messages', threadRoutes.conversationMessages);
  router.post('/messages', threadRoutes.send);
  router.post('/conversations/:id/read', threadRoutes.markRead);
  router.post('/conversations/:id/typing', threadRoutes.typing);
  router.post('/conversations/:id/person', threadRoutes.askForPerson);
  router.get('/stream', stream);
  router.get('/tickets', ticketRoutes.listTickets);
  router.post('/tickets', ticketRoutes.fileTicket);
  router.get('/tickets/forms', ticketRoutes.ticketForms);
  router.get('/knowledge-base', articleRoutes.knowledgeBase);
  router.get('/knowledge-base/articles/:id', articleRoutes.article);

  return router;
};
