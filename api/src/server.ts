import { bearerOf, verifyCoreEvent, verifyCoreJob, verifyPluginSession } from '@erxes/plugin-sdk';
import { pluginOpenApi } from '@erxes/plugin-sdk/openapi';
import { OpenAPIHandler } from '@orpc/openapi/node';
import { onError, ORPCError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/node';
import cors from 'cors';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { config, PLUGIN } from '#/config.ts';
import { JOB_RUNS } from '#/jobs.ts';
import { logger } from '#/logger.ts';
import { manifest } from '#/manifest.ts';
import { formsPublicRouter } from '#/modules/forms/embed.ts';
import { publicRouter } from '#/modules/helpcenter/public.ts';
import { runAction } from '#/modules/inbox/automations.ts';
import { webhookRoutes } from '#/modules/integrations/routes.ts';
import { messengerRoutes } from '#/modules/messenger/routes.ts';
import { syncUnits } from '#/modules/teams/sync.ts';
import { router } from '#/router.ts';

const logFailure = (error: unknown) => {
  if (!(error instanceof ORPCError) || error.status >= 500) logger.error(error);
};

// The same procedures twice: RPC for the plugin UI, REST (documented below) for scripts.
const rpc = new RPCHandler(router, { interceptors: [onError(logFailure)] });
const rest = new OpenAPIHandler(router, { interceptors: [onError(logFailure)] });

/** Settings › Developer › API reference in core shows it (the manifest's `api.docs`). */
const memberDoc = pluginOpenApi(router, {
  plugin: PLUGIN,
  audience: 'member',
  title: manifest.title,
  version: manifest.version,
  description: manifest.description,
  server: `${config.publicUrl}/api`,
  prefix: '/v1',
});

/** The member behind a request from the plugin UI, or null without a valid session token. */
const memberOf = async (authorization: string | undefined) => {
  const token = bearerOf(authorization);

  if (!token) return null;

  return verifyPluginSession(token, { coreUrl: config.coreUrl, plugin: PLUGIN }).catch(() => null);
};

/** Runs `handler`'s procedures at `prefix` for the member a session token signs in. */
const signedIn =
  (prefix: `/${string}`, handler: typeof rpc | typeof rest): express.RequestHandler =>
  async (req, res, next) => {
    const member = await memberOf(req.headers.authorization);

    if (!member) {
      res.status(401).json({ message: 'Send a session token for this plugin from core' });

      return;
    }

    const { matched } = await handler.handle(req, res, { prefix, context: { member } });

    if (!matched) next();
  };

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  // Providers post webhooks signed out, from their own servers.
  app.use('/api/public/webhooks', webhookRoutes());
  // Websites embed the messenger and forms: their routes answer any origin, so they come before
  // web's CORS. Forms find the organisation by the key frontline gave it.
  app.use('/api/public/messenger', messengerRoutes());
  app.use(
    '/api/public/:key',
    cors({ maxAge: 600 }),
    express.json({ limit: '1mb' }),
    formsPublicRouter,
  );
  // Core's API reference fetches the document from web at the organisation's own address.
  // It holds no secrets, so any origin may read it.
  app.get(
    '/api/openapi/member.json',
    cors({ origin: true, credentials: false, maxAge: 600 }),
    async (_req, res) => {
      res.json(await memberDoc);
    },
  );
  // The plugin UI runs inside web and calls this API from web's origin.
  app.use(cors({ origin: config.coreUiOrigin, maxAge: 600 }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // A 5-minute session token core issued for this member and plugin: erxes-ui's pluginFetch
  // adds it, and a script gets one from core with an API key.
  app.use('/api/rpc', signedIn('/api/rpc', rpc));
  app.use('/api/v1', signedIn('/api/v1', rest));

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
