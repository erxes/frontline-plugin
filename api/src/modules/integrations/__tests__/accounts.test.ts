import type * as DiscordWs from '@discordjs/ws';
import { WebSocketShardEvents } from '@discordjs/ws';
import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { INTEGRATION_BROKEN, JOBS, PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { clientAs } from '#/test/member.ts';
import {
  channelFor,
  fakeProviders,
  fixture,
  graphApi,
  runJob,
  runQueued,
  serve,
  telegramApi,
  webhookOf,
} from './fakes.ts';
import { asked } from './standIns.ts';

type Gateway = {
  options: { token: string; intents: number };
  destroyed: boolean;
  emit: (event: string, ...args: unknown[]) => boolean;
};

/** Every Discord gateway frontline opened, standing in for Discord's websocket. */
const gateways = vi.hoisted(() => [] as Gateway[]);

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

vi.mock('@discordjs/ws', async (importOriginal) => {
  const { EventEmitter } = await import('node:events');

  class WebSocketManager extends EventEmitter {
    destroyed = false;

    options: Gateway['options'];

    constructor(options: Gateway['options']) {
      super();
      this.options = options;
      gateways.push(this);
    }

    connect = async () => {};

    destroy = async () => {
      this.destroyed = true;
    };
  }

  return { ...(await importOriginal<typeof DiscordWs>()), WebSocketManager };
});

const { get, deliver } = serve();

describe('integration accounts', () => {
  it('shows accounts to their organisation and members allowed to see them', async () => {
    fakeProviders(telegramApi);

    await clientAs('org-acc-a').integrations.telegram.connect({ token: '777:good-token-abc' });

    const viewer = clientAs('org-acc-a', [PERMISSIONS.integrationView]);

    expect((await viewer.integrations.accounts.list({})).accounts).toHaveLength(1);
    expect((await clientAs('org-acc-b').integrations.accounts.list({})).accounts).toEqual([]);
    await expect(clientAs('org-acc-a', []).integrations.accounts.list({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      viewer.integrations.telegram.connect({ token: '777:good-token-abc' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('marks an account broken when the provider stops taking it, and tells who connected it', async () => {
    let revoked = false;

    const calls = fakeProviders(({ url }) => {
      if (revoked) return Response.json({ message: '401: Unauthorized', code: 0 }, { status: 401 });

      return url.pathname.endsWith('/applications/@me')
        ? { id: 'app-9' }
        : { id: 'bot-9', username: 'shop-bot' };
    });

    const owner = clientAs('org-acc-c');
    const account = await owner.integrations.discord.connect({ token: 'good-token-abcdefghijklm' });

    // An older bot's application has an id of its own, which the add-to-server link names.
    expect(account).toMatchObject({
      provider: 'discord',
      status: 'healthy',
      name: 'shop-bot',
      externalId: 'bot-9',
      config: { applicationId: 'app-9' },
    });
    expect(calls.map(({ url, authorization }) => [url.pathname, authorization])).toEqual([
      ['/api/v10/users/%40me', 'Bot good-token-abcdefghijklm'],
      ['/api/v10/applications/@me', 'Bot good-token-abcdefghijklm'],
    ]);

    revoked = true;

    const check = { orgId: 'org-acc-c', name: JOBS.check.name, payload: {} };

    await runJob(check);
    await runJob(check);

    expect((await owner.integrations.accounts.list({})).accounts).toMatchObject([
      { status: 'broken', error: '401: Unauthorized' },
    ]);
    // Told once, when it broke, not on every check after.
    expect(asked.notifications).toMatchObject([
      { kind: INTEGRATION_BROKEN, userIds: ['user-org-acc-c'], body: '401: Unauthorized' },
    ]);
  });

  it("reads a Discord bot's messages over its gateway, and lets go when Discord refuses the bot", async () => {
    fakeProviders(() => ({ id: 'bot-7', username: 'help-bot' }));

    const owner = clientAs('org-acc-dc');
    const token = 'gateway-token-abcdefghij';
    const account = await owner.integrations.discord.connect({ token });
    const gatewayJob = { orgId: 'org-acc-dc', name: JOBS.discordGateway.name, payload: {} };

    await channelFor('org-acc-dc', 'discord', account.id);
    await runQueued();
    await runJob(gatewayJob);

    // One gateway, though the job ran twice: this replica holds the bot's lease.
    const opened = gateways.filter((gateway) => gateway.options.token === token);

    expect(opened).toHaveLength(1);

    const [gateway] = opened;
    const author = { id: 'user-5', username: 'bold', global_name: 'Bold Customer' };

    const sent = (id: string, message: Record<string, unknown>) =>
      gateway?.emit(
        WebSocketShardEvents.Dispatch,
        {
          t: 'MESSAGE_CREATE',
          d: {
            id,
            channel_id: 'dm-1',
            author,
            content: '',
            mentions: [],
            attachments: [],
            ...message,
          },
        },
        0,
      );

    sent('m-1', { content: 'Where is my order?' });
    sent('m-2', { guild_id: 'guild-1', channel_id: 'room-1', content: 'Anyone around?' });
    sent('m-3', {
      guild_id: 'guild-1',
      channel_id: 'room-2',
      content: '<@bot-7> I was charged twice',
      mentions: [{ id: 'bot-7' }],
    });
    sent('m-4', { author: { ...author, bot: true }, content: 'Beep' });

    // The direct message and the mention; not the server chatter or another bot.
    await vi.waitFor(async () => {
      const { conversations } = await owner.conversations.list({});

      const texts = await Promise.all(
        conversations.map(async ({ id }) =>
          (await owner.conversations.messages.list({ conversationId: id })).messages.map(
            (message) => message.content,
          ),
        ),
      );

      expect(texts.flat().toSorted()).toEqual(['I was charged twice', 'Where is my order?']);
    });

    // Each starts the automations that wait for a Discord message.
    const events = await withOrg('org-acc-dc', (tx) =>
      tx.execute(
        sql`select payload->>'content' as content from core_events
            where type = 'frontline.discord.message_received' order by content`,
      ),
    );

    expect(events.rows).toEqual([
      { content: 'I was charged twice' },
      { content: 'Where is my order?' },
    ]);

    gateway?.emit(WebSocketShardEvents.Closed, 4004, 0);

    await vi.waitFor(async () => {
      expect((await owner.integrations.accounts.list({})).accounts).toMatchObject([
        { status: 'broken', error: 'Discord refused the bot token: connect the bot again' },
      ]);
    });
    expect(gateway?.destroyed).toBe(true);
  });

  it('repairs a bot by pointing Telegram at the same webhook again', async () => {
    const calls = fakeProviders(telegramApi);
    const owner = clientAs('org-acc-f');
    const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });
    const hook = calls.find((call) => call.url.pathname.endsWith('/setWebhook'))?.body;

    calls.length = 0;

    await expect(owner.integrations.accounts.repair({ id: account.id })).resolves.toMatchObject({
      status: 'healthy',
    });
    expect(calls.map((call) => call.url.pathname)).toEqual([
      '/bot777:good-token-abc/setWebhook',
      '/bot777:good-token-abc/getMe',
    ]);
    expect(calls[0]?.body).toEqual(hook);
    await expect(
      clientAs('org-acc-f', [PERMISSIONS.integrationView]).integrations.accounts.repair({
        id: account.id,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('repairs an Instagram account by subscribing the app to its page and routing it again', async () => {
    const calls = fakeProviders(graphApi);
    const owner = clientAs('org-acc-g');
    const state = new URL((await owner.integrations.meta.loginUrl()).url).searchParams.get('state');

    await get(`/meta/callback?code=login-code&state=${state ?? ''}`);

    const { accounts } = await owner.integrations.accounts.list({ provider: 'instagram' });

    calls.length = 0;

    await expect(
      owner.integrations.accounts.repair({ id: accounts[0]?.id ?? '' }),
    ).resolves.toMatchObject({ status: 'healthy' });
    expect(calls.map((call) => `${call.method} ${call.url.pathname}`)).toEqual([
      'POST /v23.0/page-1/subscribed_apps',
      'PUT /v1/routes/instagram/ig-1',
      'GET /v23.0/me',
    ]);
    expect(calls[0]?.authorization).toBe('Bearer page-token-1');
  });

  it('removes an account, so its webhook stops leading anywhere', async () => {
    const calls = fakeProviders(telegramApi);
    const owner = clientAs('org-acc-d');
    const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });
    const { path, signed } = webhookOf(calls);

    await channelFor('org-acc-d', 'telegram', account.id);
    await expect(
      clientAs('org-acc-e').integrations.accounts.remove({ ids: [account.id] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await owner.integrations.accounts.remove({ ids: [account.id] });

    expect(calls.at(-1)?.url.pathname).toBe('/bot777:good-token-abc/deleteWebhook');
    expect((await owner.integrations.accounts.list({})).accounts).toEqual([]);
    expect(await deliver(path, fixture('telegram-update.json'), signed)).toBe(200);
    expect((await owner.conversations.list({})).totalCount).toBe(0);
  });
});
