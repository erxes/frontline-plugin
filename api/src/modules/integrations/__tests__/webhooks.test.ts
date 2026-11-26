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

/** Connects `orgId`'s pages through its Facebook connection in core, and answers the accounts. */
const connected = async (orgId: string) =>
  (await clientAs(orgId).integrations.meta.connect({ connectionId: 'fb-conn' })).accounts;

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

  it("connects the pages of the organisation's Facebook connection, takes their messages and replies", async () => {
    const calls = fakeProviders(graphApi);
    const owner = clientAs('org-meta-a');

    expect(await owner.integrations.meta.connections({})).toMatchObject({
      data: [{ id: 'fb-conn' }, { id: 'fb-own' }],
      settingsPath: '/settings/integrations/facebook',
    });

    await connected('org-meta-a');

    // The connection's token lists the pages; each page's own token subscribes it.
    expect(calls.find((call) => call.url.pathname.endsWith('me/accounts'))?.authorization).toBe(
      'Bearer long-user-token',
    );
    expect(
      calls.find((call) => call.url.pathname.endsWith('page-1/subscribed_apps'))?.authorization,
    ).toBe('Bearer page-token-1');

    const { accounts } = await owner.integrations.accounts.list({});

    expect(
      accounts.map(({ provider, externalId, name, connectionId }) => ({
        provider,
        externalId,
        name,
        connectionId,
      })),
    ).toEqual([
      { provider: 'facebook', externalId: 'page-1', name: 'Shop', connectionId: 'fb-conn' },
      { provider: 'instagram', externalId: 'ig-1', name: '@shop.mn', connectionId: 'fb-conn' },
    ]);

    const page = accounts.find((account) => account.provider === 'facebook');

    await channelFor('org-meta-a', 'facebook', page?.id ?? '');

    const raw = fixture('meta-delivery.json');

    expect(await deliver('/meta', raw)).toBe(401);
    expect(await deliver('/meta', raw, signedByMeta(`${raw} `))).toBe(401);

    // A forged signature gets the same answer whether or not it names a connected page.
    const elsewhere = raw.replaceAll('page-1', 'page-elsewhere');

    expect(await deliver('/meta', elsewhere, signedByMeta(elsewhere, 'a-forged-secret'))).toBe(401);
    expect(await deliver('/meta', elsewhere, signedByMeta(elsewhere))).toBe(200);

    expect(await deliver('/meta', raw, signedByMeta(raw))).toBe(200);
    await runQueued();
    expect((await clientAs('org-meta-b').conversations.list({})).totalCount).toBe(0);

    const [conversation] = (await owner.conversations.list({})).conversations;
    const conversationId = conversation?.id ?? '';
    const { messages } = await owner.conversations.messages.list({ conversationId });

    // Newest first, and no echo of the page's own message. Meta's links expire, so the files are
    // copied to core, named as their links name them.
    expect(messages.map(({ content, attachments }) => ({ content, attachments }))).toEqual([
      {
        content: '',
        attachments: [
          {
            url: '/core/v1/files/file-photo-jpg/download',
            name: 'photo.jpg',
            type: 'image/jpeg',
            size: 4,
          },
          {
            // The stand-in's file ids spell each letter that isn't Latin as a dash.
            url: `/core/v1/files/file-${'-'.repeat(10)}pdf/download`,
            name: 'Нэхэмжлэх.pdf',
            type: 'application/pdf',
            size: 4,
          },
        ],
      },
      { content: 'Do you ship to Darkhan?', attachments: [] },
    ]);
    // Messenger's events carry only the sender's id; their name comes from Meta's profile.
    expect(asked.created).toContainEqual(
      expect.objectContaining({ firstName: 'Bat', lastName: 'Erdene', source: 'facebook' }),
    );
    // Their profile picture, copied off Meta's CDN, is their avatar in core.
    expect(asked.avatars.get(conversation?.customerId ?? '')).toBe(
      '/core/v1/files/file-profile-jpeg/download',
    );

    // A reply to the question quotes it, as Messenger's own reply does.
    const question = messages.at(-1);

    await owner.conversations.messages.create({
      conversationId,
      content: 'We do',
      replyToId: question?.id ?? null,
    });
    await runQueued();

    expect(calls.at(-1)).toMatchObject({
      authorization: 'Bearer page-token-1',
      body: {
        recipient: { id: 'psid-1' },
        messaging_type: 'RESPONSE',
        message: { reply_to: { mid: question?.externalId }, text: 'We do' },
      },
    });

    // The picture is asked for once per person, not again with their next messages.
    const again = raw.replaceAll('"m_', '"m_again_');

    expect(await deliver('/meta', again, signedByMeta(again))).toBe(200);
    await runQueued();
    expect(
      calls.filter((call) => call.url.searchParams.get('fields') === 'profile_pic'),
    ).toHaveLength(1);
  });

  it('keeps the messages sent with an event it can’t read, and fails replies once Meta refuses the token', async () => {
    fakeProviders(graphApi);
    const owner = clientAs('org-meta-revoked');

    await connected('org-meta-revoked');

    const { accounts } = await owner.integrations.accounts.list({ provider: 'facebook' });

    await channelFor('org-meta-revoked', 'facebook', accounts[0]?.id ?? '');

    // An event in a shape frontline doesn't read, ahead of the customer's two messages.
    const raw = fixture('meta-delivery.json').replace(
      '"messaging": [',
      '"messaging": [{ "recipient": { "id": "page-1" }, "timestamp": 1763180000000 },',
    );

    expect(await deliver('/meta', raw, signedByMeta(raw))).toBe(200);

    const [conversation] = (await owner.conversations.list({})).conversations;
    const conversationId = conversation?.id ?? '';

    expect((await owner.conversations.messages.list({ conversationId })).messages).toHaveLength(2);

    // The page's admin took frontline's access away.
    fakeProviders(() =>
      Response.json(
        { error: { message: 'Error validating access token', code: 190 } },
        { status: 400 },
      ),
    );

    const reply = await owner.conversations.messages.create({ conversationId, content: 'Hi?' });

    await runQueued();

    const after = (await owner.conversations.messages.list({ conversationId })).messages;

    expect(after.find((message) => message.id === reply.id)?.deliveryStatus).toBe('failed');
    expect(
      (await owner.integrations.accounts.list({ provider: 'facebook' })).accounts,
    ).toMatchObject([{ status: 'broken', error: 'Error validating access token' }]);
  });

  it('refuses a connection core does not give, and connects nothing', async () => {
    fakeProviders(graphApi);

    const owner = clientAs('org-meta-gone');

    await expect(
      owner.integrations.meta.connect({ connectionId: 'fb-removed' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect((await owner.integrations.accounts.list({})).accounts).toEqual([]);
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

    await connected('org-relay-a');
    expect(relayed(calls)).toEqual([
      route('PUT', '/v1/routes/facebook/page-1'),
      route('PUT', '/v1/routes/instagram/ig-1'),
    ]);

    // Every field frontline reads and every field the older installs on the same app read,
    // added to the app's own: core's automations keep their lead forms.
    const subscribed = calls.find(
      (call) => call.method === 'POST' && call.url.pathname.endsWith('page-1/subscribed_apps'),
    );

    expect(subscribed?.url.searchParams.get('subscribed_fields')?.split(',').toSorted()).toEqual([
      'conversations',
      'feed',
      'leadgen',
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

    await connected('org-relay-b');
    await connected('org-relay-c');
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

    // The page meta-relay refused, named with its reason.
    await expect(connected('org-relay-d')).rejects.toMatchObject({
      message: 'Shop: The Meta relay refused: it answered 401',
    });
    expect((await clientAs('org-relay-d').integrations.accounts.list({})).accounts).toEqual([]);

    fakeProviders(withRelay());
    await connected('org-relay-d');

    const calls = fakeProviders(withRelay(500));

    expect(await removeAll('org-relay-d')).toEqual([]);
    expect(relayed(calls).map(({ method, path }) => `${method} ${path}`)).toEqual([
      'DELETE /v1/routes/facebook/page-1',
      'DELETE /v1/routes/instagram/ig-1',
    ]);
  });
});
