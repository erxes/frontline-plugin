import { describe, expect, it, vi } from 'vite-plus/test';
import { clientAs } from '#/test/member.ts';
import {
  channelFor,
  fakeProviders,
  fixture,
  graphApi,
  type ProviderCall,
  runQueued,
  serve,
  signedByMeta,
} from './fakes.ts';
import { asked } from './standIns.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

const { get, deliver } = serve();

const subscriptionCheck = async (token: string) => {
  const response = await get(
    `/meta?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=4711`,
  );

  return [response.status, await response.text()];
};

const returnedTo = async (path: string) =>
  new URL((await get(path)).headers.get('location') ?? '').searchParams;

/** Goes through Meta's login as `orgId`'s member, and reads where it sent them back. */
const loggedIn = async (orgId: string) => {
  const { url } = await clientAs(orgId).integrations.meta.loginUrl();
  const state = new URL(url).searchParams.get('state') ?? '';

  return returnedTo(`/meta/callback?code=login-code&state=${state}`);
};

/** The Graph API, and meta-relay answering `status`. */
const withRelay =
  (status = 200) =>
  (call: ProviderCall) =>
    call.url.hostname === 'relay.example' ? new Response(null, { status }) : graphApi(call);

/** The calls to meta-relay, by path. */
const relayed = (calls: ProviderCall[]) =>
  calls
    .filter((call) => call.url.hostname === 'relay.example')
    .map(({ method, url, authorization, body }) => ({
      method,
      path: url.pathname,
      authorization,
      body,
    }))
    .toSorted((a, b) => a.path.localeCompare(b.path));

const removeAll = async (orgId: string) => {
  const owner = clientAs(orgId);
  const { accounts } = await owner.integrations.accounts.list({});

  await owner.integrations.accounts.remove({ ids: accounts.map((account) => account.id) });

  return (await owner.integrations.accounts.list({})).accounts;
};

describe('meta', () => {
  it('answers the subscription check with the verify token only', async () => {
    expect(await subscriptionCheck('test-meta-verify')).toEqual([200, '4711']);
    expect((await subscriptionCheck('wrong'))[0]).toBe(403);
  });

  it('connects the pages the login granted, takes their messages and replies', async () => {
    const calls = fakeProviders(graphApi);
    const owner = clientAs('org-meta-a');

    expect((await loggedIn('org-meta-a')).get('connected')).toBe('1');
    expect(
      calls.find((call) => call.url.pathname.endsWith('page-1/subscribed_apps'))?.authorization,
    ).toBe('Bearer page-token-1');

    const { accounts } = await owner.integrations.accounts.list({});

    expect(
      accounts.map(({ provider, externalId, name }) => ({ provider, externalId, name })),
    ).toEqual([
      { provider: 'facebook', externalId: 'page-1', name: 'Shop' },
      { provider: 'instagram', externalId: 'ig-1', name: '@shop.mn' },
    ]);

    const page = accounts.find((account) => account.provider === 'facebook');

    await channelFor('org-meta-a', 'facebook', page?.id ?? '');

    const raw = fixture('meta-delivery.json');

    expect(await deliver('/meta', raw)).toBe(401);
    expect(await deliver('/meta', raw, signedByMeta(`${raw} `))).toBe(401);
    expect(await deliver('/meta', raw, signedByMeta(raw))).toBe(200);
    expect((await clientAs('org-meta-b').conversations.list({})).totalCount).toBe(0);

    const [conversation] = (await owner.conversations.list({})).conversations;
    const conversationId = conversation?.id ?? '';
    const { messages } = await owner.conversations.messages.list({ conversationId });

    // Newest first, and no echo of the page's own message.
    expect(messages.map(({ content, attachments }) => ({ content, attachments }))).toEqual([
      {
        content: '',
        attachments: [{ url: 'https://cdn.example.com/photo.jpg', name: 'image', type: 'image' }],
      },
      { content: 'Do you ship to Darkhan?', attachments: [] },
    ]);
    // Messenger's events carry only the sender's id; their name comes from Meta's profile.
    expect(asked.created).toContainEqual(
      expect.objectContaining({ firstName: 'Bat', lastName: 'Erdene', source: 'facebook' }),
    );

    await owner.conversations.messages.create({ conversationId, content: 'We do' });
    await runQueued();

    expect(calls.at(-1)).toMatchObject({
      authorization: 'Bearer page-token-1',
      body: { recipient: { id: 'psid-1' }, messaging_type: 'RESPONSE', message: { text: 'We do' } },
    });
  });

  it('refuses a login state it did not sign', async () => {
    fakeProviders(graphApi);

    expect((await returnedTo('/meta/callback?code=login-code&state=forged')).get('error')).toBe(
      'The login expired: connect again',
    );
  });
});

/** A call to meta-relay with this install's key; a PUT routes the page to frontline's webhook. */
const route = (method: string, path: string) => ({
  method,
  path,
  authorization: 'Bearer test-relay-key',
  body: method === 'PUT' ? { url: 'http://localhost:3399/api/public/webhooks/meta' } : null,
});

describe('meta-relay', () => {
  it('routes the page and its Instagram account here, and leaves the app subscribed when they go', async () => {
    const calls = fakeProviders(withRelay());

    expect((await loggedIn('org-relay-a')).get('connected')).toBe('1');
    expect(relayed(calls)).toEqual([
      route('PUT', '/v1/routes/facebook/page-1'),
      route('PUT', '/v1/routes/instagram/ig-1'),
    ]);

    // Every field frontline reads and every field the older installs on the same app read.
    const subscribed = calls.find((call) => call.url.pathname.endsWith('page-1/subscribed_apps'));

    expect(subscribed?.method).toBe('POST');
    expect(subscribed?.url.searchParams.get('subscribed_fields')?.split(',').toSorted()).toEqual([
      'conversations',
      'feed',
      'message_deliveries',
      'message_echoes',
      'message_reactions',
      'message_reads',
      'messages',
      'messaging_handovers',
      'messaging_postbacks',
      'messaging_referrals',
      'standby',
    ]);

    calls.length = 0;

    expect(await removeAll('org-relay-a')).toEqual([]);
    expect(relayed(calls)).toEqual([
      route('DELETE', '/v1/routes/facebook/page-1'),
      route('DELETE', '/v1/routes/instagram/ig-1'),
    ]);
    expect(calls.filter((call) => call.url.hostname === 'graph.facebook.com')).toEqual([]);
  });

  it('keeps the route while another organisation still takes the page', async () => {
    const calls = fakeProviders(withRelay());

    await loggedIn('org-relay-b');
    await loggedIn('org-relay-c');
    calls.length = 0;

    await removeAll('org-relay-b');

    expect(relayed(calls)).toEqual([]);

    await removeAll('org-relay-c');

    expect(relayed(calls)).toEqual([
      route('DELETE', '/v1/routes/facebook/page-1'),
      route('DELETE', '/v1/routes/instagram/ig-1'),
    ]);
  });

  it('connects nothing meta-relay refuses, and removes accounts while it is down', async () => {
    fakeProviders(withRelay(401));

    expect((await loggedIn('org-relay-d')).get('error')).toMatch(
      /^The Meta relay refused the (facebook|instagram) account: 401$/,
    );
    expect((await clientAs('org-relay-d').integrations.accounts.list({})).accounts).toEqual([]);

    fakeProviders(withRelay());
    await loggedIn('org-relay-d');

    const calls = fakeProviders(withRelay(500));

    expect(await removeAll('org-relay-d')).toEqual([]);
    expect(relayed(calls).map(({ method, path }) => `${method} ${path}`)).toEqual([
      'DELETE /v1/routes/facebook/page-1',
      'DELETE /v1/routes/instagram/ig-1',
    ]);
  });
});
