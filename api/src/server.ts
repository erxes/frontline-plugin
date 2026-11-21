import {
  type PluginMember,
  verifyCoreEvent,
  verifyCoreJob,
  verifyPublicCall,
} from '@erxes/plugin-sdk';
import { pluginOpenApi } from '@erxes/plugin-sdk/openapi';
import { OpenAPIHandler } from '@orpc/openapi/node';
import { onError, ORPCError, ValidationError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/node';
import { resolve, sep } from 'node:path';
import compression from 'compression';
import cors from 'cors';
import express from 'express';
import { z } from 'zod';

import { config, PLUGIN, signedByCore } from '#/config.ts';
import { JOB_RUNS } from '#/jobs.ts';
import { logger, requestLogger } from '#/logger.ts';
import { manifest } from '#/manifest.ts';
import { memberOf } from '#/member.ts';
import { fail, verifiedBy } from '#/modules/fail.ts';
import { visitorIpLimit } from '#/modules/limits.ts';
import { formsPublicRouter } from '#/modules/forms/embed.ts';
import { formChoices } from '#/modules/forms/links.ts';
import { pipelineChoices } from '#/modules/tickets/automation.ts';
import { publicRouter } from '#/modules/helpcenter/public.ts';
import { siteByHost, siteByKey } from '#/modules/helpcenter/site/routes.ts';
import { runAction } from '#/modules/inbox/automations.ts';
import { integrationChoices } from '#/modules/integrations/automationRecords.ts';
import { webhookRoutes } from '#/modules/integrations/routes.ts';
import {
  CONNECTION_CHANGED,
  followConnection,
} from '#/modules/integrations/providers/metaConnect.ts';
import { onAgentEvent } from '#/modules/messenger/agent.ts';
import { messengerRoutes } from '#/modules/messenger/routes.ts';
import { applyMerge } from '#/modules/contacts/merges.ts';
import { syncUnits } from '#/modules/teams/sync.ts';
import { timelineRoutes } from '#/modules/timelines.ts';
import { transferRoutes } from '#/modules/transfer/routes.ts';
import { router } from '#/router.ts';

const logFailure = (error: unknown) => {
  if (!(error instanceof ORPCError) || error.status >= 500) logger.error(error);
};

type Issues = ValidationError['issues'];

/**
 * Refused input says what is wrong, by `explain`, where oRPC says "Input validation failed".
 */
const explainInput = (explain: (issues: Issues) => string) => (error: unknown) => {
  if (
    error instanceof ORPCError &&
    error.code === 'BAD_REQUEST' &&
    error.cause instanceof ValidationError
  ) {
    throw new ORPCError('BAD_REQUEST', {
      message: explain(error.cause.issues),
      data: error.data,
      cause: error.cause,
    });
  }
};

// The same procedures twice: RPC for the plugin UI, REST (documented below) for scripts. The UI
// shows a member the first issue's own words; a script gets every issue and where, as zod's
// pretty error ("✖ A question needs at least 2 options → at steps[0].options").
const rpc = new RPCHandler(router, {
  interceptors: [onError(logFailure)],
  clientInterceptors: [
    onError(explainInput((issues) => issues[0]?.message ?? 'Input validation failed')),
  ],
});

const rest = new OpenAPIHandler(router, {
  interceptors: [onError(logFailure)],
  clientInterceptors: [onError(explainInput((issues) => z.prettifyError({ issues })))],
});

/** Settings › Developer › API reference in core shows it (the manifest's `api.docs`). */
const memberDoc = pluginOpenApi(router, {
  plugin: PLUGIN,
  audience: 'member',
  title: manifest.title,
  version: manifest.version,
  description: manifest.description,
  server: manifest.api.url,
  prefix: '/v1',
});

const anyOrigin = cors({ origin: true, credentials: false, maxAge: 600 });

/**
 * A built app's files from `dir`, compressed. Files in its `hashed` folder are named by their
 * content hash, so a browser keeps them for good. An entry such as `remoteEntry.js` revalidates
 * on each load, since a stale one imports chunks the next deploy removed.
 */
const builtFiles = (dir: string, hashed: string) => {
  const kept = resolve(dir, hashed) + sep;

  return [
    compression(),
    express.static(dir, {
      setHeaders: (res, path) =>
        res.set(
          'cache-control',
          path.startsWith(kept) ? 'public, max-age=31536000, immutable' : 'no-cache',
        ),
    }),
  ];
};

/** Runs `handler`'s procedures at `prefix` for the member the token signs in (`member.ts`). */
const signedIn =
  (prefix: `/${string}`, handler: typeof rpc | typeof rest): express.RequestHandler =>
  async (req, res, next) => {
    const member = await memberOf(
      req,
      res,
      'Send a plugin session token from core, or an access token from Sign in with erxes',
    );

    if (!member) return;

    const { matched } = await handler.handle(req, res, { prefix, context: { member } });

    if (!matched) next();
  };

const recordChoices = (member: PluginMember, type: string) => {
  if (type === 'form') return formChoices(member);

  if (type === 'pipeline') return pipelineChoices(member);

  return integrationChoices(member, type);
};

/**
 * What core's automations call: the manifest's actions, signed by core (the inbox's, the form
 * link and the send steps), and a `plugin_record` field's choices, as the member in the builder.
 */
const automationRoutes = () =>
  express
    .Router()
    .post('/actions/:type', express.json({ limit: '256kb' }), runAction)
    .get('/records/:type', async (req, res) => {
      const member = await memberOf(req, res, 'Open this plugin inside erxes to sign in');

      if (!member) return;

      try {
        const choices = await recordChoices(member, req.params.type);

        if (choices) res.json(choices);
        else res.status(404).json({ message: `No ${req.params.type} records` });
      } catch (error) {
        fail(res, error, 'record choices');
      }
    });

/**
 * The desktop app, once a member signed in with erxes, asks through core where this API is
 * (`/core/v1/plugins/frontline/public/<orgId>/desktop`, the manifest's `publicPaths`).
 */
const desktopApi: express.RequestHandler = async (req, res) => {
  const call = await verifiedBy(res, 'public call', 'Ask through core', () =>
    verifyPublicCall(req.headers.authorization, '', signedByCore),
  );

  if (!call) return;

  res.json({ apiUrl: manifest.api.url });
};

// Core delivers the manifest's `subscriptions` here, signed over the raw body; anything but
// 2xx retries. A change to a branch or department refreshes the organisation's copy; a merge
// of customers or companies moves frontline's rows to the kept one; a Facebook connection removed
// or turned off stops its pages; a core agent's answer goes into its messenger conversation.
const coreEvents: express.RequestHandler = async (req, res) => {
  const body: unknown = req.body;

  const event = await verifiedBy(res, 'event token', 'Only core delivers events', () =>
    verifyCoreEvent(req.headers.authorization, typeof body === 'string' ? body : '', signedByCore),
  );

  if (!event) return;

  if (event.type.startsWith('core.unit.')) {
    const result = await syncUnits(event.organizationId);

    logger.info(
      { event: event.type, eventId: event.id, orgId: event.organizationId, result },
      'units synced',
    );
  }

  if (event.type === CONNECTION_CHANGED) {
    const stopped = await followConnection(event);

    logger.info(
      { event: event.type, eventId: event.id, orgId: event.organizationId, stopped },
      'Facebook connection followed',
    );
  }

  if (event.type.endsWith('.merged')) {
    const merged = await applyMerge(event);

    logger.info(
      { event: event.type, eventId: event.id, orgId: event.organizationId, merged },
      'merged contacts followed',
    );
  }

  await onAgentEvent(event);

  res.sendStatus(204);
};

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(requestLogger);
  // A help center's site: at its own host first, then at `/help/<key>` on frontline's address.
  app.use(siteByHost);
  app.use(siteByKey());
  // Providers post webhooks signed out, from their own servers.
  app.use('/api/public/webhooks', webhookRoutes());
  // What websites load and call signed out answers any origin, and counts against the visitor's
  // IP: the messenger, forms (found by the key frontline gave the organisation), a help center
  // and its knowledge base embed (by the key or domain frontline issued). Websites embed them
  // anywhere, and a token in a header, never a cookie, is the visitor. At `/widget`, the embeds'
  // scripts.
  app.use('/api/public', cors({ maxAge: 600 }), visitorIpLimit);
  app.use('/api/public/messenger', messengerRoutes());
  app.get('/api/public/desktop', desktopApi);
  app.use('/api/public', publicRouter());
  app.use('/api/public/:key', formsPublicRouter);

  if (config.widgetDir)
    app.use('/widget', cors({ maxAge: 600 }), ...builtFiles(config.widgetDir, 'chunks'));

  // Core's API reference fetches the document from web at the organisation's own address.
  // It holds no secrets, so any origin may read it.
  app.get('/api/openapi/member.json', anyOrigin, async (_req, res) => {
    res.json(await memberDoc);
  });
  // The plugin UI calls this API from web, at whatever address the organisation
  // uses (acme.os.erxes.io, its own domain). Any origin may: access is the
  // Bearer session token core issues, never a cookie, so CORS guards nothing here.
  // Routes for websites (an API key, customer tokens) set their own CORS.
  app.use(['/api/rpc', '/api/v1', '/api/automations/records', '/ui'], anyOrigin);

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

  app.post('/api/events', express.text({ type: '*/*', limit: '1mb' }), coreEvents);

  app.use('/api/automations', automationRoutes());
  app.use('/api/transfer', transferRoutes());
  app.use('/api/timelines', timelineRoutes());

  if (config.uiDir) app.use('/ui', ...builtFiles(config.uiDir, 'static'));

  return app;
};
