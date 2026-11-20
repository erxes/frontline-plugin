import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { clientAs } from '#/test/member.ts';
import { asked, connectMeta } from './standIns.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

const profileCalls = (connectionId: string) =>
  asked.metaGraph
    .filter((call) => call.connectionId === connectionId && call.path === 'me/messenger_profile')
    .map(({ method, query, body }) => ({ method, query, body }));

describe('connections', () => {
  it('lists the pages and accounts core connected, and who may manage them', async () => {
    const page = connectMeta('org-meta-list', 'facebook');
    const account = connectMeta('org-meta-list', 'instagram');

    expect(await clientAs('org-meta-list').integrations.meta.connections()).toMatchObject({
      connections: [
        { id: page.id, kind: 'facebook', name: 'Shop' },
        { id: account.id, kind: 'instagram', username: 'shop.mn' },
      ],
      canManage: true,
    });
    expect(await clientAs('org-meta-empty').integrations.meta.connections()).toEqual({
      connections: [],
      canManage: true,
    });
  });
});

describe('bots', () => {
  const settings = {
    name: 'Shop bot',
    persistentMenu: [
      { id: 'hours', type: 'postback' as const, title: 'Opening hours' },
      { id: 'site', type: 'link' as const, title: 'Our site', url: 'https://shop.example.com' },
    ],
    iceBreakers: [],
    getStartedText: 'Start',
    greeting: 'Hi {{user_first_name}}',
  };

  it('sets the page’s Messenger profile, changes it and clears it', async () => {
    const owner = clientAs('org-bot-a');
    const connection = connectMeta('org-bot-a', 'facebook');

    const bot = await owner.integrations.meta.bots.create({
      ...settings,
      connectionId: connection.id,
    });

    expect(bot).toMatchObject({
      name: 'Shop bot',
      connectionName: 'Shop',
      kind: 'facebook',
      status: 'healthy',
    });

    const payload = (itemId?: string) => JSON.stringify({ botId: bot.id, itemId });

    expect(profileCalls(connection.id)).toEqual([
      {
        method: 'POST',
        query: {},
        body: {
          get_started: { payload: payload() },
          persistent_menu: [
            {
              locale: 'default',
              composer_input_disabled: false,
              call_to_actions: [
                { type: 'postback', title: 'Start', payload: payload() },
                { type: 'postback', title: 'Opening hours', payload: payload('hours') },
                {
                  type: 'web_url',
                  title: 'Our site',
                  url: 'https://shop.example.com',
                  webview_height_ratio: 'full',
                },
              ],
            },
          ],
          greeting: [{ locale: 'default', text: 'Hi {{user_first_name}}' }],
        },
      },
      { method: 'DELETE', query: {}, body: { fields: ['ice_breakers'] } },
    ]);

    await expect(
      owner.integrations.meta.bots.create({ ...settings, connectionId: connection.id }),
    ).rejects.toMatchObject({ code: 'CONFLICT', message: 'This page already has a bot' });
    await expect(
      owner.integrations.meta.bots.update({ ...settings, id: bot.id, greeting: 'refused' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Meta refused: Invalid parameter' });
    expect(await owner.integrations.meta.bots.get({ id: bot.id })).toMatchObject({
      greeting: 'Hi {{user_first_name}}',
    });

    await owner.integrations.meta.bots.update({
      ...settings,
      id: bot.id,
      persistentMenu: [],
      iceBreakers: [{ id: 'q1', question: 'Where are you?' }],
      greeting: null,
    });

    expect(profileCalls(connection.id).at(-1)).toEqual({
      method: 'DELETE',
      query: {},
      body: { fields: ['persistent_menu', 'greeting'] },
    });
    expect((await clientAs('org-bot-b').integrations.meta.bots.list()).bots).toEqual([]);

    await owner.integrations.meta.bots.remove({ id: bot.id });

    expect(profileCalls(connection.id).at(-1)).toEqual({
      method: 'DELETE',
      query: {},
      body: { fields: ['get_started', 'persistent_menu', 'greeting', 'ice_breakers'] },
    });
    expect((await owner.integrations.meta.bots.list()).bots).toEqual([]);
  });

  it('sets an Instagram account’s menu and ice breakers only', async () => {
    const connection = connectMeta('org-bot-c', 'instagram');

    await clientAs('org-bot-c').integrations.meta.bots.create({
      ...settings,
      connectionId: connection.id,
      iceBreakers: [{ id: 'q1', question: 'Do you ship?' }],
    });

    const [profile] = profileCalls(connection.id);

    expect(profile?.query).toEqual({ platform: 'instagram' });
    expect(Object.keys(z.record(z.string(), z.unknown()).parse(profile?.body))).toEqual([
      'persistent_menu',
      'ice_breakers',
    ]);
  });
});
