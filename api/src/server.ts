import { bearerOf, verifyCoreJob, verifyPluginSession } from '@erxes/plugin-sdk';
import { onError, ORPCError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/node';
import cors from 'cors';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { config, PLUGIN } from '#/config.ts';
import { JOBS } from '#/core.ts';
import { logger } from '#/logger.ts';
import { checkDomains } from '#/modules/helpcenter/domains.ts';
import { publicRouter } from '#/modules/helpcenter/public.ts';
import { checkSla } from '#/modules/tickets/sla.ts';
import { router } from '#/router.ts';

/** What each job in the manifest's `jobs` does for one organisation. */
const JOB_RUNS: Record<string, (orgId: string) => Promise<unknown>> = {
  [JOBS.sla.name]: checkSla,
  [JOBS.domains.name]: checkDomains,
};

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

export const createApp = () => {
  const app = express();

  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
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

    const result = await run(job.orgId);

    logger.info({ job: job.name, jobId: job.jobId, orgId: job.orgId, result }, 'job done');
    res.sendStatus(204);
  });

  if (config.uiDir) app.use('/ui', express.static(config.uiDir));

  return app;
};
