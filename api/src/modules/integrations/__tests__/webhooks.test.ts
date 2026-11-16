import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vite-plus/test';
import { clientAs } from '#/test/member.ts';
import {
  channelFor,
  fakeProviders,
  fixture,
  type ProviderCall,
  runQueued,
  serve,
  telegramApi,
  webhookOf,
} from './fakes.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

const { get, deliver } = serve();

describe('telegram', () => {
  it('connects a bot, takes its updates into a conversation and replies through it', async () => {
    const calls = fakeProviders(telegramApi);
    const owner = clientAs('org-tg-a');

    const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });

    expect(account).toMatchObject({
      provider: 'telegram',
      externalId: '777',
      name: '@shop_help_bot',
    });
    expect(account).not.toHaveProperty('secret');

    const { path, signed } = webhookOf(calls);

    await channelFor('org-tg-a', 'telegram', account.id);

    const update = fixture('telegram-update.json');

    expect(await deliver(path, update, { 'x-telegram-bot-api-secret-token': 'forged' })).toBe(401);
    expect(await deliver(path, update)).toBe(401);
    expect(await deliver(path, update, signed)).toBe(200);
    // Telegram sends an update again until it hears 200; the repeat adds nothing.
    expect(await deliver(path, update, signed)).toBe(200);
    expect(await deliver('/telegram/no-such-key', update)).toBe(200);
    expect(await deliver(path, '{not json', signed)).toBe(400);

    const { conversations } = await owner.conversations.list({});

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      content: 'Hello, is my order on its way?',
      externalId: '4242',
    });
    expect((await clientAs('org-tg-b').conversations.list({})).totalCount).toBe(0);

    const conversationId = conversations[0]?.id ?? '';

    await owner.conversations.messages.create({ conversationId, content: 'It ships today' });
    await runQueued();

    expect(calls.at(-1)?.url.pathname).toBe('/bot777:good-token-abc/sendMessage');
    expect(calls.at(-1)?.body).toEqual({ chat_id: '4242', text: 'It ships today' });

    const { messages } = await owner.conversations.messages.list({ conversationId });

    // Newest first.
    expect(
      messages.map(({ content, deliveryStatus, externalId }) => ({
        content,
        deliveryStatus,
        externalId,
      })),
    ).toEqual([
      { content: 'It ships today', deliveryStatus: 'sent', externalId: '4242:42' },
      { content: 'Hello, is my order on its way?', deliveryStatus: null, externalId: '4242:41' },
    ]);
  });

  it('refuses a token Telegram refuses', async () => {
    fakeProviders(telegramApi);

    await expect(
      clientAs('org-tg-c').integrations.telegram.connect({ token: '1:bad-token-xyz' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Telegram refused the token: Unauthorized',
    });
  });
});

const graphApi = (call: ProviderCall) => {
  const path = call.url.pathname.replace('/v23.0/', '');

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

  return { success: true };
};

const signedByMeta = (raw: string) => ({
  'x-hub-signature-256': `sha256=${createHmac('sha256', 'test-meta-app-secret').update(raw).digest('hex')}`,
});

const subscriptionCheck = async (token: string) => {
  const response = await get(
    `/meta?hub.mode=subscribe&hub.verify_token=${token}&hub.challenge=4711`,
  );

  return [response.status, await response.text()];
};

const returnedTo = async (path: string) =>
  new URL((await get(path)).headers.get('location') ?? '').searchParams;

describe('meta', () => {
  it('answers the subscription check with the verify token only', async () => {
    expect(await subscriptionCheck('test-meta-verify')).toEqual([200, '4711']);
    expect((await subscriptionCheck('wrong'))[0]).toBe(403);
  });

  it('connects the pages the login granted, takes their messages and replies', async () => {
    const calls = fakeProviders(graphApi);
    const owner = clientAs('org-meta-a');

    const { url } = await owner.integrations.meta.loginUrl();
    const state = new URL(url).searchParams.get('state') ?? '';

    expect(
      (await returnedTo(`/meta/callback?code=login-code&state=${state}`)).get('connected'),
    ).toBe('1');
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
