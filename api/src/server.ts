import { bearerOf, verifyCoreEvent, verifyCoreJob, verifyPluginSession } from '@erxes/plugin-sdk';
import { pluginOpenApi } from '@erxes/plugin-sdk/openapi';
import { OpenAPIHandler } from '@orpc/openapi/node';
import { onError, ORPCError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/node';
import cors from 'cors';
import express from 'express';

import { config, PLUGIN } from '#/config.ts';
import { JOB_RUNS } from '#/jobs.ts';
import { logger, requestLogger } from '#/logger.ts';
import { manifest } from '#/manifest.ts';
import { fail, verifiedBy } from '#/modules/fail.ts';
import { visitorIpLimit } from '#/modules/limits.ts';
import { formsPublicRouter } from '#/modules/forms/embed.ts';
import { formChoices } from '#/modules/forms/links.ts';
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

const anyOrigin = cors({ origin: true, credentials: false, maxAge: 600 });

const signedByCore = { coreUrl: config.coreUrl, plugin: PLUGIN };

/**
 * The member behind a request from the plugin UI, or null once it is answered: 401 with `refused`
 * without a valid session token, 503 while core is out of reach.
 */
const memberOf = (req: express.Request, res: express.Response, refused: string) =>
  verifiedBy(res, 'session token', refused, async () => {
    const token = bearerOf(req.headers.authorization);

    if (!token) throw new Error('no session token');

    return verifyPluginSession(token, signedByCore);
  });

/** Runs `handler`'s procedures at `prefix` for the member a session token signs in. */
const signedIn =
  (prefix: `/${string}`, handler: typeof rpc | typeof rest): express.RequestHandler =>
  async (req, res, next) => {
    const member = await memberOf(req, res, 'Send a session token for this plugin from core');

    if (!member) return;

    const { matched } = await handler.handle(req, res, { prefix, context: { member } });

    if (!matched) next();
  };

/**
 * What core's automations call: the manifest's actions, signed by core (the inbox's, the form
 * link and the send steps), and a `plugin_record` field's choices, as the member in the builder.
 */
const automationRoutes = () =>
  express
    .Router()
    .post('/actions/:type', express.json({ limit: '256kb' }), runAction)
    .get('/records/form', async (req, res) => {
      const member = await memberOf(req, res, 'Open this plugin inside erxes to sign in');

      if (!member) return;

      try {
        res.json(await formChoices(member));
      } catch (error) {
        fail(res, error, 'form choices');
      }
    });

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(requestLogger);
  // Providers post webhooks signed out, from their own servers.
  app.use('/api/public/webhooks', webhookRoutes());
  // What websites load and call signed out answers any origin, and counts against the visitor's
  // IP: the messenger, forms (found by the key frontline gave the organisation), a help center
  // and its knowledge base embed (by the key or domain frontline issued). Websites embed them
  // anywhere, and a token in a header, never a cookie, is the visitor. At `/widget`, the embeds'
  // scripts.
  app.use('/api/public', cors({ maxAge: 600 }), visitorIpLimit);
  app.use('/api/public/messenger', messengerRoutes());
  app.use('/api/public', publicRouter());
  app.use('/api/public/:key', formsPublicRouter);

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

  // Core's API reference fetches the document from web at the organisation's own address.
  // It holds no secrets, so any origin may read it.
  app.get('/api/openapi/member.json', anyOrigin, async (_req, res) => {
    res.json(await memberDoc);
  });
  // The plugin UI calls this API from web, at whatever address the organisation
  // uses (acme.os.erxes.io, its own domain). Any origin may: access is the
  // Bearer session token core issues, never a cookie, so CORS guards nothing here.
  // Routes for websites (an API key, customer tokens) set their own CORS.
  app.use(['/api/rpc', '/api/v1', '/ui'], anyOrigin);

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // A 5-minute session token core issued for this member and plugin: erxes-ui's pluginFetch
  // adds it, and a script gets one from core with an API key.
  app.use('/api/rpc', signedIn('/api/rpc', rpc));
  app.use('/api/v1', signedIn('/api/v1', rest));

  // Core POSTs each job attempt here, signed over the raw body; anything but 2xx retries.
  app.post('/api/jobs/:name', express.text({ type: '*/*' }), async (req, res) => {
    const body: unknown = req.body;

    const job = await verifiedBy(res, 'job token', 'Only core runs jobs', async () => {
      const verified = await verifyCoreJob(
        req.headers.authorization,
        typeof body === 'string' ? body : '',
        signedByCore,
      );

      if (verified.name !== req.params.name) throw new Error('the job is not the one at this path');

      return verified;
    });

    if (!job) return;

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

    const event = await verifiedBy(res, 'event token', 'Only core delivers events', () =>
      verifyCoreEvent(
        req.headers.authorization,
        typeof body === 'string' ? body : '',
        signedByCore,
      ),
    );

    if (!event) return;

    if (event.type.startsWith('core.unit.')) {
      const result = await syncUnits(event.organizationId);

      logger.info(
        { event: event.type, eventId: event.id, orgId: event.organizationId, result },
        'units synced',
      );
    }

    res.sendStatus(204);
  });

  app.use('/api/automations', automationRoutes());

  if (config.uiDir) app.use('/ui', express.static(config.uiDir));

  return app;
};
