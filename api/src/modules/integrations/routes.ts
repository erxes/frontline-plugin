import express from 'express';
import { z } from 'zod';
import { logger } from '#/logger.ts';
import { deliverInbound, deliverReactions } from './inbound.ts';
import type { Routed, WebhookRequest, WebhookSource } from './provider.ts';
import { WEBHOOKS } from './providers/index.ts';
import { callWebhooks } from './providers/call/routes.ts';
import { connectMetaPages, SETTINGS_URL } from './providers/metaLogin.ts';
import { accountOf } from './store.ts';

/**
 * What a delivery's routes hold, delivered: false, delivering nothing, when one route's events
 * aren't its account's. A route to no connected account is logged and skipped.
 */
const handle = async (webhook: WebhookSource, request: WebhookRequest, routes: Routed[]) => {
  const found = await Promise.all(
    routes.map(async (routed) => {
      const row = await accountOf(routed);

      if (!row) logger.info({ provider: routed.provider }, 'webhook for no connected account');

      return row ? { row, inbound: webhook.receive(row, routed.events, request) } : null;
    }),
  );

  const accounts = found.filter((account) => account !== null);

  if (accounts.some(({ inbound }) => !inbound)) return false;

  await Promise.all(
    accounts.map(async ({ row, inbound }) => {
      await deliverInbound(row, inbound?.messages ?? []);
      await deliverReactions(row, inbound?.reactions ?? []);
    }),
  );

  return true;
};

const Callback = z.object({ code: z.string(), state: z.string() });

/**
 * The providers' signed-out routes at `/api/public/webhooks`: Meta's login callback, each
 * provider's address check, and the deliveries. A delivery is answered 200 once it is in the
 * inbox, 401 when its signature fails, and 500 when it could not be stored, so the provider
 * sends it again.
 */
export const webhookRoutes = () => {
  const router = express.Router();

  router.use(callWebhooks());
  router.get('/meta/callback', async (req, res) => {
    const params = Callback.safeParse(req.query);
    const back = new URL(SETTINGS_URL);

    if (!params.success) {
      back.searchParams.set('error', 'Meta did not finish the login');
      res.redirect(back.toString());

      return;
    }

    try {
      back.searchParams.set(
        'connected',
        String(await connectMetaPages(params.data.code, params.data.state)),
      );
    } catch (error) {
      logger.warn({ err: error }, 'meta login failed');
      back.searchParams.set('error', error instanceof Error ? error.message : 'The login failed');
    }

    res.redirect(back.toString());
  });

  router.get('/:source', (req, res) => {
    const answer = WEBHOOKS[req.params.source]?.confirm?.(req.query);

    if (answer) res.type('text/plain').send(answer);
    else res.sendStatus(403);
  });

  router.post('/:source{/:key}', express.text({ type: '*/*', limit: '2mb' }), async (req, res) => {
    const { source } = req.params;
    const webhook = WEBHOOKS[source];
    const raw = typeof req.body === 'string' ? req.body : '';

    if (!webhook) {
      res.sendStatus(404);

      return;
    }

    try {
      const body: unknown = JSON.parse(raw);
      const request: WebhookRequest = { key: req.params.key, raw, body, headers: req.headers };
      const routes = webhook.route(request);

      res.sendStatus(routes && (await handle(webhook, request, routes)) ? 200 : 401);
    } catch (error) {
      // A body that isn't the provider's shape won't be any better sent again.
      if (error instanceof SyntaxError || error instanceof z.ZodError) res.sendStatus(400);
      else throw error;
    }
  });

  return router;
};
