import { ORPCError } from '@orpc/server';
import express, { type Request, type Response } from 'express';
import { LRUCache } from 'lru-cache';
import { z } from 'zod';
import { BrowserInfo } from '#/db/messenger.ts';
import { logger } from '#/logger.ts';
import { fail } from '../fail.ts';
import { connectIpLimit, sendIpLimit, underKeyLimit } from '../limits.ts';
import { voteRoutes } from '../surveys/votes.ts';
import { integrationChanges, isOnlineAt } from './adapter.ts';
import { articleRoutes } from './articles.ts';
import { fileRoutes } from './files.ts';
import { messengerOf, tokenOf, visitorOf } from './session.ts';
import { streaming, subscribe } from './stream.ts';
import { ticketRoutes } from './tickets.ts';
import { asVisitor, messengerIntegration, threadRoutes, visitorConversations } from './threads.ts';
import { Identity, signedCustomer } from './identity.ts';
import {
  fillIn,
  newVisitor,
  recordVisit,
  saveVisitorData,
  setOnline,
  supportersOf,
  verify,
  VisitorData,
} from './visitors.ts';

const Connect = VisitorData.extend({
  key: z.string().min(1).max(200),
  token: z.string().optional(),
  /** The visitor's email or phone, when they leave one. */
  identity: Identity.optional(),
  browser: BrowserInfo.optional(),
});

export type { Identity } from './identity.ts';

export type { VisitorConversation, VisitorMessage, VisitorMessages } from './threads.ts';

export type { TicketForms, VisitorTicket } from './tickets.ts';

/** The active messenger a key opens, with its settings and its team from core, or NOT_FOUND. */
const opened = async (key: string) => {
  const found = await messengerOf(key);
  const settings = found && (await messengerIntegration(found.orgId, found.integrationId));

  if (!found || !settings) throw new ORPCError('NOT_FOUND', { message: 'No such messenger' });

  return { ...found, settings, supporters: await supportersOf(found.orgId, settings.supporterIds) };
};

/**
 * `/settings` by messenger key for a minute, as browsers keep it (`max-age=60`), so a page view
 * costs no query and no call to core. A change to the messenger drops it at once in this process.
 */
const openedRecently = new LRUCache<string, Awaited<ReturnType<typeof opened>>>({
  max: 5000,
  ttl: 60_000,
  fetchMethod: opened,
});

integrationChanges.on('changed', (integrationId) => {
  for (const [key, cached] of openedRecently.entries())
    if (cached.integrationId === integrationId) openedRecently.delete(key);
});

/**
 * What a visitor sees of the messenger: its settings with its team in place of the team's ids,
 * whether that team is online now, and whether it takes tickets.
 */
const messengerView = ({ settings, supporters }: Awaited<ReturnType<typeof opened>>) => {
  const { supporterIds, channelId, ticketPipelineIds, ...shown } = settings;

  return {
    ...shown,
    isOnline: isOnlineAt(settings, new Date()),
    supporters,
    tickets: ticketPipelineIds.length > 0,
  };
};

/** What `/connect` answers, as the widget reads it. */
export type Connected = {
  token: string;
  identified: boolean;
  messenger: ReturnType<typeof messengerView>;
  conversations: Awaited<ReturnType<typeof visitorConversations>>;
};

/**
 * A visitor opens the messenger with its integration's key, and gets back a signed token that
 * names them, the messenger's settings, its team and their conversations. A token for this
 * messenger keeps its visitor; without one, the visitor becomes a new core lead. Only an identity
 * the website signed makes them an existing customer. A verified visitor stays verified only while
 * the website signs them, so a page signed out starts a new visitor.
 */
const connect = async (req: Request, res: Response) => {
  try {
    const input = Connect.parse(req.body);

    if (!(await underKeyLimit(res, input.key, 'connect'))) return;

    const shown = await opened(input.key);
    const found = { orgId: shown.orgId, integrationId: shown.integrationId };
    const signed = input.identity && (await signedCustomer(found, input.identity));

    const known = await visitorOf(input.token);

    const kept =
      known?.orgId === found.orgId &&
      known.integrationId === found.integrationId &&
      (!known.verified || known.customerId === signed)
        ? known
        : null;

    const anonymous = async () => kept ?? (await newVisitor(found));

    const visitor = signed
      ? await verify(kept, found, signed)
      : input.identity
        ? await fillIn(await anonymous(), input.identity)
        : await anonymous();

    await recordVisit(visitor, { browser: input.browser, remoteAddress: req.ip }, true);
    await saveVisitorData(visitor, input);

    const reply: Connected = {
      token: visitor === known && input.token ? input.token : await tokenOf(visitor),
      identified: visitor.identified,
      messenger: messengerView(shown),
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
    const shown = await openedRecently.fetch(Connect.shape.key.parse(req.query.key));

    if (!shown) throw new ORPCError('NOT_FOUND', { message: 'No such messenger' });

    const reply: Pick<Connected, 'messenger'> = { messenger: messengerView(shown) };

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
 * However the stream ends, before or after it opens, its listener goes and the visitor goes
 * offline once their last stream has.
 */
const stream = async (req: Request, res: Response) => {
  const state: { closed: boolean; release: (() => void) | null } = { closed: false, release: null };

  res.on('close', () => {
    state.closed = true;
    state.release?.();
  });

  try {
    const visitor = await visitorOf(z.string().optional().parse(req.query.token));

    if (!visitor) {
      res.status(401).json({ message: 'Connect to the messenger first' });

      return;
    }

    const stop = await subscribe(visitor.orgId, visitor.customerId, ({ conversationId, event }) => {
      // Until the stream opens, the messenger's first read covers what happens.
      if (res.headersSent)
        res.write(`event: ${event}\ndata: ${JSON.stringify({ conversationId })}\n\n`);
    });

    const online = setOnline(visitor, true);
    const beat: { timer?: NodeJS.Timeout } = {};

    // Offline goes after online has settled, so it can't land first.
    const goOffline = async () => {
      await Promise.allSettled([online]);

      if (!streaming(visitor.orgId, visitor.customerId)) await setOnline(visitor, false);
    };

    state.release = () => {
      state.release = null;
      clearInterval(beat.timer);
      stop();
      goOffline().catch((error: unknown) => {
        logger.error({ err: error, customerId: visitor.customerId }, 'visitor offline failed');
      });
    };

    if (state.closed) return state.release();

    await online;

    if (state.closed) return;

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write(': connected\n\n');
    // A comment every 25 s keeps proxies from closing a quiet stream.
    beat.timer = setInterval(() => res.write(': ping\n\n'), 25_000);
  } catch (error) {
    state.release?.();
    fail(res, error, 'messenger stream');
  }
};

/** The website messenger's signed-out API at `/api/public/messenger`. */
export const messengerRoutes = () => {
  const router = express.Router();

  router.use('/files', fileRoutes());
  router.use(express.json({ limit: '64kb' }));
  router.get('/settings', settings);
  router.post('/connect', connectIpLimit, connect);
  router.post('/browser', browserInfo);
  router.get('/conversations', threadRoutes.conversations);
  router.get('/conversations/:id/messages', threadRoutes.conversationMessages);
  router.post('/messages', sendIpLimit, threadRoutes.send);
  router.post('/conversations/:id/read', threadRoutes.markRead);
  router.post('/conversations/:id/typing', threadRoutes.typing);
  router.post('/conversations/:id/person', threadRoutes.askForPerson);
  router.get('/surveys/:messageId', voteRoutes.read);
  router.post('/surveys/:messageId/votes', voteRoutes.vote);
  router.get('/stream', stream);
  router.get('/tickets', ticketRoutes.listTickets);
  router.post('/tickets', ticketRoutes.createTicket);
  router.get('/tickets/forms', ticketRoutes.ticketForms);
  router.get('/knowledge-base', articleRoutes.knowledgeBase);
  router.get('/knowledge-base/articles/:id', articleRoutes.article);

  return router;
};
