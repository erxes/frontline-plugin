import { bearerOf, verifyCoreEvent, verifyCoreJob, verifyPluginSession } from '@erxes/plugin-sdk';
import { onError, ORPCError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/node';
import cors from 'cors';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { config, PLUGIN } from '#/config.ts';
import { JOB_RUNS } from '#/jobs.ts';
import { logger } from '#/logger.ts';
import { formsPublicRouter } from '#/modules/forms/embed.ts';
import { publicRouter } from '#/modules/helpcenter/public.ts';
import { runAction } from '#/modules/inbox/automations.ts';
import { webhookRoutes } from '#/modules/integrations/routes.ts';
import { messengerRoutes } from '#/modules/messenger/routes.ts';
import { syncUnits } from '#/modules/teams/sync.ts';
import { router } from '#/router.ts';

const rpc = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      if (!(error instanceof ORPCError) || error.status >= 500) logger.error(error);
    }),
  ],
});

/** The member behind a request from the plugin UI, or null without a valid session token. */
const memberOf = async (authorization: string | undefined) => {
  const token = bearerOf(authorization);

  if (!token) return null;

  return verifyPluginSession(token, { coreUrl: config.coreUrl, plugin: PLUGIN }).catch(() => null);
};

/**
 * What websites load and call signed out: their routes answer any origin, so they come before
 * web's CORS. Forms find the organisation by the key frontline gave it. `/widget` serves the
 * embeds' scripts.
 */
const embeds = (app: express.Express) => {
  // Providers post webhooks signed out, from their own servers.
  app.use('/api/public/webhooks', webhookRoutes());
  app.use('/api/public/messenger', messengerRoutes());
  app.use(
    '/api/public/:key',
    cors({ maxAge: 600 }),
    express.json({ limit: '1mb' }),
    formsPublicRouter,
  );

  if (config.widgetDir)
    app.use(
      '/widget',
      cors({ maxAge: 600 }),
      express.static(config.widgetDir, {
        // Chunks are named by their hash. An entry revalidates on each load, since a stale
        // one imports chunks the next deploy removed.
        setHeaders: (res, path) =>
          res.set(
            'cache-control',
            path.includes('/chunks/') ? 'public, max-age=31536000, immutable' : 'no-cache',
          ),
      }),
    );
};

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  embeds(app);
  // The plugin UI runs inside web and calls this API from web's origin.
  app.use(cors({ origin: config.coreUiOrigin, maxAge: 600 }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // erxes-ui's pluginFetch adds a 5-minute session token core issued for this member and plugin.
  app.use('/api/rpc', async (req, res, next) => {
    const member = await memberOf(req.headers.authorization);

    if (!member) {
      res.status(401).json({ message: 'Open this plugin inside erxes to sign in' });

      return;
    }

    const { matched } = await rpc.handle(req, res, { prefix: '/api/rpc', context: { member } });

    if (!matched) next();
  });

  // Signed out: a help center's visitors, found by the key or domain frontline issued.
  app.use('/api/public', publicRouter());

  // Core POSTs each job attempt here, signed over the raw body; anything but 2xx retries.
  app.post('/api/jobs/:name', express.text({ type: '*/*' }), async (req, res) => {
    const body: unknown = req.body;

    const job = await verifyCoreJob(
      req.headers.authorization,
      typeof body === 'string' ? body : '',
      { coreUrl: config.coreUrl, plugin: PLUGIN },
    ).catch(() => null);

    if (!job || job.name !== req.params.name) {
      res.status(401).json({ message: 'Only core runs jobs' });

      return;
    }

    const run = JOB_RUNS[job.name];

    if (!run) {
      res.status(404).json({ message: `No job ${job.name}` });

      return;
    }

    const result = await run(job);

    logger.info({ job: job.name, jobId: job.jobId, orgId: job.orgId, result }, 'job done');
    res.sendStatus(204);
  });

  // Core delivers the manifest's `subscriptions` here, signed over the raw body; anything but
  // 2xx retries. A change to a branch or department refreshes the organisation's copy.
  app.post('/api/events', express.text({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const body: unknown = req.body;

    const event = await verifyCoreEvent(
      req.headers.authorization,
      typeof body === 'string' ? body : '',
      { coreUrl: config.coreUrl, plugin: PLUGIN },
    ).catch(() => null);

    if (!event) {
      res.status(401).json({ message: 'Only core delivers events' });

      return;
    }

    if (event.type.startsWith('core.unit.')) {
      const result = await syncUnits(event.organizationId);

      logger.info(
        { event: event.type, eventId: event.id, orgId: event.organizationId, result },
        'units synced',
      );
    }

    res.sendStatus(204);
  });

  // Core runs the manifest's automation actions here, signed: the inbox's and the send steps.
  app.post('/api/automations/actions/:type', express.json({ limit: '256kb' }), runAction);

  if (config.uiDir) app.use('/ui', express.static(config.uiDir));

  return app;
};
