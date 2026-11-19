import { createHmac, randomUUID } from 'node:crypto';
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

/** The bytes core's storage holds for every file in a test. */
export const FILE_BYTES = 'file';

/**
 * What a request sent: the fields of the form frontline gave fetch, a file as its name, type and
 * size; JSON as its value; anything else, such as a file's bytes, as text.
 */
const bodyOf = async (request: Request, sent: RequestInit['body']) => {
  if (sent instanceof FormData)
    return Object.fromEntries(
      [...sent].map(([key, value]) => [
        key,
        typeof value === 'string'
          ? value
          : { name: value.name, type: value.type, size: value.size },
      ]),
    );

  const text = await request.text();

  if (!text) return null;

  try {
    const value: unknown = JSON.parse(text);

    return Json.parse(value);
  } catch {
    return text;
  }
};

/**
 * Answers the providers' APIs with `answer`'s recorded payloads and returns the calls, newest
 * last. A `Response` answers as it is; anything else answers as a 200 JSON body. Core's storage
 * takes every upload and gives `FILE_BYTES` for every download. Requests to the test's own
 * server still go through.
 */
export const fakeProviders = (answer: (call: ProviderCall) => unknown) => {
  const calls: ProviderCall[] = [];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);

    if (url.hostname === '127.0.0.1') return realFetch(request);

    const call = {
      url,
      method: request.method,
      authorization: request.headers.get('authorization'),
      body: await bodyOf(request, init?.body),
    };

    calls.push(call);

    if (url.hostname === 'files.core.test')
      return new Response(request.method === 'GET' ? FILE_BYTES : null);

    const answered = answer(call);

    return answered instanceof Response ? answered : Response.json(answered);
  });

  return calls;
};

/**
 * A payload a provider really sends, field for field, from `fixtures/`. Don't add a field it
 * leaves out: Messenger and Instagram messages carry only the sender's page-scoped id, so a name
 * in a fixture hid that frontline never looked the sender up.
 */
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

  const get = (path: string) => fetch(`${base}/public/webhooks${path}`, { redirect: 'manual' });

  return {
    get,
    /** Logs `orgId` in through Meta's dialog and gives a channel to the page or the account. */
    connectMeta: async (orgId: string, provider: 'facebook' | 'instagram') => {
      const owner = clientAs(orgId);
      const { url } = await owner.integrations.meta.loginUrl();
      const state = new URL(url).searchParams.get('state') ?? '';

      await get(`/meta/callback?code=login-code&state=${state}`);

      const { accounts } = await owner.integrations.accounts.list({ provider });
      const account = accounts[0];

      if (!account) throw new Error(`no ${provider} account`);

      await channelFor(orgId, provider, account.id);

      return { owner, account };
    },
    deliver: async (path: string, raw: string, headers: Record<string, string> = {}) =>
      (await post(`/public/webhooks${path}`, raw, headers)).status,
    /** POSTs `body` as JSON to `path` under `/api`, and answers its status. */
    send: async (path: string, body: unknown) =>
      (await post(path, JSON.stringify(body), {})).status,
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

/** Runs a job as core would deliver it, on its first attempt or `attempt`. */
export const runJob = async (job: z.infer<typeof Queued>, attempt = 1) => {
  const run = JOB_RUNS[job.name];

  if (!run) throw new Error(`No job ${job.name}`);

  await run({ ...job, jobId: `job-${job.name}`, attempt });
};

/** Runs the jobs frontline queued since the last run, on their first attempt or `attempt`. */
export const runQueued = async (attempt = 1) => {
  await Promise.all(asked.jobs.splice(0).map(async (job) => runJob(Queued.parse(job), attempt)));
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

/** The id of `orgId`'s conversation with the provider's id `externalId`. */
export const conversationWith = async (orgId: string, externalId: string) => {
  const { conversations } = await clientAs(orgId).conversations.list({});
  const found = conversations.find((conversation) => conversation.externalId === externalId);

  if (!found) throw new Error(`no conversation ${externalId}`);

  return found.id;
};

export const lastPost = (calls: ProviderCall[]) =>
  calls.filter((call) => call.method === 'POST').at(-1);

/**
 * The Bot API's answers for the bot `777`; a token with `bad-token` in it is refused, and so is a
 * file named `refused`.
 */
export const telegramApi = (call: ProviderCall) => {
  const method = call.url.pathname.split('/').at(-1);

  if (call.url.pathname.includes('bad-token'))
    return Response.json(
      { ok: false, error_code: 401, description: 'Unauthorized' },
      { status: 401 },
    );

  if (JSON.stringify(call.body).includes('refused'))
    return Response.json(
      { ok: false, error_code: 400, description: 'Bad Request: wrong file type' },
      { status: 400 },
    );

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

  if (method === 'sendMessage' || method === 'sendPhoto' || method === 'sendDocument')
    return {
      ok: true,
      result: { message_id: 42, date: 1763180100, chat: { id: 4242, type: 'private' } },
    };

  if (method === 'getFile')
    return {
      ok: true,
      result: {
        file_id: 'photo-big',
        file_unique_id: 'AQADbig',
        file_size: 4,
        file_path: 'photos/file_7.jpg',
      },
    };

  // A file's bytes, from the address getFile gave.
  if (call.url.pathname.startsWith('/file/')) return new Response(FILE_BYTES);

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

  // Each message Messenger takes gets an id of its own, as Meta gives one.
  if (path === 'me/messages') return { recipient_id: 'psid-1', message_id: `m_${randomUUID()}` };

  // The profile of the person behind psid-1, which Messenger's events leave out.
  if (path === 'psid-1') return { id: 'psid-1', first_name: 'Bat', last_name: 'Erdene' };

  // Instagram's profile of igsid-6, who wrote with only their id.
  if (path === 'igsid-6') return { id: 'igsid-6', name: 'Saraa', username: 'saraa.mn' };

  if (path.endsWith('/comments') || path.endsWith('/replies'))
    return call.method === 'POST' ? { id: `reply-to-${path.split('/')[0]}` } : { data: [] };

  if (path === 'page-1/feed' || path === 'page-1/photos')
    return { id: 'page-1_post-new', post_id: 'page-1_post-new' };

  return { success: true };
};

/** The signature Meta puts on a delivery, with the install's app secret unless `secret` names another. */
export const signedByMeta = (raw: string, secret = 'test-meta-app-secret') => ({
  'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`,
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
