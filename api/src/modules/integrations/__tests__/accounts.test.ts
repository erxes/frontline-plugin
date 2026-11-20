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
  const { DiscordAPIError } = await import('@discordjs/rest');

  class WebSocketManager extends EventEmitter {
    destroyed = false;

    options: Gateway['options'];

    constructor(options: Gateway['options']) {
      super();
      this.options = options;
      gateways.push(this);
    }

    // Discord refuses a revoked token when the library asks for the gateway's address.
    connect = async () => {
      if (this.options.token.startsWith('revoked'))
        throw new DiscordAPIError({ message: '401: Unauthorized', code: 0 }, 0, 401, 'GET', '', {});
    };

    destroy = async () => {
      this.destroyed = true;
    };
  }

  return { ...(await importOriginal<typeof DiscordWs>()), WebSocketManager };
});

const { deliver } = serve();

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

  it('joins an account connected from a channel to it, and to no second channel', async () => {
    const calls = fakeProviders(telegramApi);

    const owner = clientAs('org-acc-into');
    const channel = await owner.channels.create({ name: 'Sales' });
    const other = await owner.channels.create({ name: 'Support' });

    const connect = (channelId: string) =>
      owner.integrations.telegram.connect({ token: '777:good-token-abc', channelId });

    const account = await connect(channel.id);

    await connect(channel.id);
    await connect(other.id);
    expect(await owner.integrations.list({})).toMatchObject([
      { channelId: channel.id, kind: 'telegram', config: { accountId: account.id } },
    ]);
    await expect(
      owner.integrations.create({
        channelId: other.id,
        kind: 'telegram',
        name: 'Again',
        config: { accountId: account.id },
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    // A member who doesn't manage the channel is refused before Telegram is asked.
    const asks = calls.length;

    await expect(
      clientAs(
        'org-acc-into',
        [PERMISSIONS.integrationManage],
        'user-outsider',
      ).integrations.telegram.connect({ token: '777:good-token-abc', channelId: channel.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(calls).toHaveLength(asks);
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
      {
        kind: INTEGRATION_BROKEN,
        userIds: ['user-org-acc-c'],
        body: 'shop-bot: 401: Unauthorized',
      },
    ]);
  });

  it("reads a Discord bot's messages over its gateway, catches up, and lets go when Discord refuses the bot", async () => {
    const author = { id: 'user-5', username: 'bold', global_name: 'Bold Customer' };

    const base = {
      channel_id: 'dm-1',
      type: 0,
      author,
      content: '',
      mentions: [],
      attachments: [],
    };

    const missed = { ...base, id: 'm-6', content: 'Are you there?' };

    const calls = fakeProviders(({ url }) =>
      url.pathname.endsWith('/messages')
        ? url.pathname.includes('dm-1')
          ? [missed, { ...base, id: 'm-1', content: 'Where is my order?' }]
          : []
        : { id: 'bot-7', username: 'help-bot' },
    );

    const owner = clientAs('org-acc-dc');
    const token = 'gateway-token-abcdefghij';
    const account = await owner.integrations.discord.connect({ token });

    await channelFor('org-acc-dc', 'discord', account.id);
    await runQueued();
    await runJob({ orgId: 'org-acc-dc', name: JOBS.discordGateway.name, payload: {} });

    // One gateway, though the job ran twice: this replica holds the bot's lease.
    const opened = gateways.filter((gateway) => gateway.options.token === token);

    expect(opened).toHaveLength(1);

    const [gateway] = opened;

    const dispatch = (t: string, d: unknown) =>
      gateway?.emit(WebSocketShardEvents.Dispatch, { t, d }, 0);

    const sent = (id: string, message: Record<string, unknown>) =>
      dispatch('MESSAGE_CREATE', { ...base, id, ...message });

    const texts = async () => {
      const { conversations } = await owner.conversations.list({});

      const each = await Promise.all(
        conversations.map(async ({ id }) =>
          (await owner.conversations.messages.list({ conversationId: id })).messages.map(
            (message) => message.content,
          ),
        ),
      );

      return each.flat().toSorted();
    };

    const server = { guild_id: 'guild-1', channel_id: 'room-2' };

    sent('m-1', { content: 'Where is my order?' });
    sent('m-2', { ...server, content: 'Anyone around?' });
    sent('m-3', {
      ...server,
      content: '<@bot-7> I was charged twice',
      mentions: [{ id: 'bot-7' }],
    });
    sent('m-4', { author: { ...author, bot: true }, content: 'Beep' });
    // A reply that doesn't ping the bot, which Discord sends blank, and a pin.
    sent('m-5', { ...server, type: 19 });
    sent('m-7', { type: 6, content: 'pinned' });

    // The direct message and the mention; not the server chatter, a blank, a pin or another bot.
    await vi.waitFor(async () => {
      expect(await texts()).toEqual(['I was charged twice', 'Where is my order?']);
    });

    // A new session asks for what came after the last message the inbox has in each channel.
    dispatch('READY', {});

    await vi.waitFor(async () => {
      expect(await texts()).toEqual([
        'Are you there?',
        'I was charged twice',
        'Where is my order?',
      ]);
    });
    expect(
      calls
        .find((call) => call.url.pathname.endsWith('/dm-1/messages'))
        ?.url.searchParams.get('after'),
    ).toBe('m-1');

    // Each starts the automations that wait for a Discord message.
    const events = await withOrg('org-acc-dc', (tx) =>
      tx.execute(
        sql`select payload->>'content' as content from core_events
            where type = 'frontline.discord.message_received' order by content`,
      ),
    );

    expect(events.rows.map((row) => row.content)).toEqual([
      'Are you there?',
      'I was charged twice',
      'Where is my order?',
    ]);

    gateway?.emit(WebSocketShardEvents.Closed, 4004, 0);

    await vi.waitFor(async () => {
      expect((await owner.integrations.accounts.list({})).accounts).toMatchObject([
        { status: 'broken', error: 'Discord refused the bot token: connect the bot again' },
      ]);
    });
    expect(gateway?.destroyed).toBe(true);
  });

  it('marks a Discord bot broken when Discord refuses its token as the gateway opens', async () => {
    fakeProviders(() => ({ id: 'bot-8', username: 'old-bot' }));

    const owner = clientAs('org-acc-dr');

    await owner.integrations.discord.connect({ token: 'revoked-token-abcdefghij' });
    await runQueued();

    expect((await owner.integrations.accounts.list({})).accounts).toMatchObject([
      { status: 'broken', error: 'Discord refused the bot token: connect the bot again' },
    ]);
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
