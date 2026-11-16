import { createHmac } from 'node:crypto';
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

/**
 * Serves the app for the file's tests; `get` and `deliver` reach `/api/public/webhooks`, and
 * `act` core's automation steps.
 */
export const serve = () => {
  let base = '';
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = createApp().listen(0, () => resolve());
    });

    const address = server.address();

    if (!address || typeof address === 'string') throw new Error('not listening on a port');

    base = `http://127.0.0.1:${address.port}/api`;
  });

  afterAll(() => {
    server.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const post = (path: string, raw: string, headers: Record<string, string>) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: raw,
    });

  return {
    get: (path: string) => fetch(`${base}/public/webhooks${path}`, { redirect: 'manual' }),
    deliver: async (path: string, raw: string, headers: Record<string, string> = {}) =>
      (await post(`/public/webhooks${path}`, raw, headers)).status,
    /** Runs an automation step as core calls it, as `orgId`'s `user` in run `run`. */
    act: async (
      type: string,
      body: unknown,
      {
        orgId,
        run,
        token = `core-call:${orgId}:user-${orgId}`,
      }: {
        orgId: string;
        run: string;
        token?: string;
      },
    ) => {
      const response = await post(`/automations/actions/${type}`, JSON.stringify(body), {
        authorization: `Bearer ${token}`,
        'idempotency-key': `${run}:step-1`,
      });

      return { status: response.status, body: Json.parse(await response.json()) };
    },
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

  return owner.integrations.create({
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

  if (method === 'getWebhookInfo')
    return {
      ok: true,
      result: {
        url: 'https://frontline.example/api/public/webhooks/telegram/key',
        has_custom_certificate: false,
        pending_update_count: 3,
        last_error_date: 1763180000,
        last_error_message: 'Wrong response from the webhook: 502 Bad Gateway',
        max_connections: 40,
        allowed_updates: ['message'],
      },
    };

  if (method === 'sendMessage')
    return {
      ok: true,
      result: { message_id: 42, date: 1763180100, chat: { id: 4242, type: 'private' } },
    };

  return { ok: true, result: true };
};

const POST = {
  id: 'page-1_post-9',
  message: 'New blue jackets are in',
  permalink_url: 'https://www.facebook.com/page-1/posts/9',
  full_picture: 'https://cdn.example.com/jacket.jpg',
  created_time: '2025-11-15T04:00:00+0000',
};

/**
 * The Graph API's answers for the page `page-1` and its Instagram account `ig-1`. A call whose
 * body says `refused` fails as Meta fails one.
 */
export const graphApi = (call: ProviderCall) => {
  const path = call.url.pathname.replace('/v23.0/', '');

  if (JSON.stringify(call.body ?? null).includes('refused'))
    return Response.json({ error: { message: 'Invalid parameter' } }, { status: 400 });

  if (path === POST.id) return POST;

  if (path === 'page-1/published_posts')
    return { data: [POST], paging: { cursors: { after: 'cursor-2' }, next: 'https://next' } };

  if (path === 'oauth/access_token')
    return {
      access_token: call.url.searchParams.get('code') ? 'short-user-token' : 'long-user-token',
    };

  if (path === 'me/accounts')
    return {
      data: [
        {
          id: 'page-1',
          name: 'Shop',
          access_token: 'page-token-1',
          instagram_business_account: { id: 'ig-1', username: 'shop.mn' },
        },
      ],
    };

  if (path === 'me/messages') return { recipient_id: 'psid-1', message_id: 'm_sent' };

  if (path.endsWith('/comments') || path.endsWith('/replies'))
    return call.method === 'POST' ? { id: `reply-to-${path.split('/')[0]}` } : { data: [] };

  if (path === 'page-1/feed' || path === 'page-1/photos')
    return { id: 'page-1_post-new', post_id: 'page-1_post-new' };

  return { success: true };
};

/** The signature Meta puts on a delivery, with the test's app secret. */
export const signedByMeta = (raw: string) => ({
  'x-hub-signature-256': `sha256=${createHmac('sha256', 'test-meta-app-secret').update(raw).digest('hex')}`,
});

const Hook = z.object({ url: z.string(), secret_token: z.string() });

/** Where the bot was told to post its updates, and the header it sends with them. */
export const webhookOf = (calls: ProviderCall[]) => {
  const hook = Hook.parse(calls.find((call) => call.url.pathname.endsWith('/setWebhook'))?.body);

  return {
    path: new URL(hook.url).pathname.replace('/api/public/webhooks', ''),
    signed: { 'x-telegram-bot-api-secret-token': hook.secret_token },
  };
};
