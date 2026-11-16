import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, vi } from 'vite-plus/test';
import { z } from 'zod';
import { JOB_RUNS } from '#/jobs.ts';
import { createApp } from '#/server.ts';
import { clientAs } from '#/test/member.ts';
import { asked } from './standIns.ts';

/** One call frontline made to a provider's API. */
export interface ProviderCall {
  url: URL;
  method: string;
  authorization: string | null;
  body: unknown;
}

const Json = z.json();

const realFetch = globalThis.fetch;

/**
 * Answers the providers' APIs with `answer`'s recorded payloads and returns the calls, newest
 * last. A `Response` answers as it is; anything else answers as a 200 JSON body. Requests to the
 * test's own server still go through.
 */
export const fakeProviders = (answer: (call: ProviderCall) => unknown) => {
  const calls: ProviderCall[] = [];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);

    if (url.hostname === '127.0.0.1') return realFetch(request);

    const text = await request.text();

    const call = {
      url,
      method: request.method,
      authorization: request.headers.get('authorization'),
      body: text ? Json.parse(JSON.parse(text)) : null,
    };

    calls.push(call);

    const answered = answer(call);

    return answered instanceof Response ? answered : Response.json(answered);
  });

  return calls;
};

export const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** Serves the app for the file's tests; `get` and `deliver` reach `/api/public/webhooks`. */
export const serve = () => {
  let base = '';
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = createApp().listen(0, () => resolve());
    });

    const address = server.address();

    if (!address || typeof address === 'string') throw new Error('not listening on a port');

    base = `http://127.0.0.1:${address.port}/api/public/webhooks`;
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  return {
    get: (path: string) => fetch(`${base}${path}`, { redirect: 'manual' }),
    deliver: async (path: string, raw: string, headers: Record<string, string> = {}) =>
      (
        await fetch(`${base}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: raw,
        })
      ).status,
  };
};

const Queued = z.object({
  orgId: z.string(),
  name: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

/** Runs a job as core would deliver it. */
export const runJob = async (job: z.infer<typeof Queued>) => {
  const run = JOB_RUNS[job.name];

  if (!run) throw new Error(`No job ${job.name}`);

  await run({ ...job, jobId: `job-${job.name}`, attempt: 1 });
};

/** Runs the jobs frontline queued since the last run. */
export const runQueued = async () => {
  await Promise.all(asked.jobs.splice(0).map(async (job) => runJob(Queued.parse(job))));
};

/** A channel in `orgId` with an integration that takes `accountId`'s conversations. */
export const channelFor = async (orgId: string, kind: string, accountId: string) => {
  const owner = clientAs(orgId);
  const channel = await owner.channels.create({ name: `${kind} support` });

  await owner.integrations.create({
    channelId: channel.id,
    kind,
    name: kind,
    config: { accountId },
  });
};

/** The Bot API's answers for the bot `777`; a token with `bad-token` in it is refused. */
export const telegramApi = (call: ProviderCall) => {
  const method = call.url.pathname.split('/').at(-1);

  if (call.url.pathname.includes('bad-token'))
    return Response.json({ ok: false, description: 'Unauthorized' }, { status: 401 });

  if (method === 'getMe')
    return {
      ok: true,
      result: { id: 777, is_bot: true, first_name: 'Help', username: 'shop_help_bot' },
    };

  if (method === 'sendMessage')
    return {
      ok: true,
      result: { message_id: 42, date: 1763180100, chat: { id: 4242, type: 'private' } },
    };

  return { ok: true, result: true };
};

const Hook = z.object({ url: z.string(), secret_token: z.string() });

/** Where the bot was told to post its updates, and the header it sends with them. */
export const webhookOf = (calls: ProviderCall[]) => {
  const hook = Hook.parse(calls.find((call) => call.url.pathname.endsWith('/setWebhook'))?.body);

  return {
    path: new URL(hook.url).pathname.replace('/api/public/webhooks', ''),
    signed: { 'x-telegram-bot-api-secret-token': hook.secret_token },
  };
};
