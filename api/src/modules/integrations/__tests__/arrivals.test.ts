import { describe, expect, it, vi } from 'vite-plus/test';
import { clientAs } from '#/test/member.ts';
import { channelFor, fakeProviders, fixture, serve, telegramApi, webhookOf } from './fakes.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

const { deliver } = serve();

describe('messages arriving at once', () => {
  it('keeps two messages of a new chat in one conversation', async () => {
    const calls = fakeProviders(telegramApi);
    const owner = clientAs('org-arrive-a');
    const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });
    const { path, signed } = webhookOf(calls);

    await channelFor('org-arrive-a', 'telegram', account.id);

    const first = fixture('telegram-update.json');

    const second = first
      .replace('918273001', '918273002')
      .replace('"message_id": 41', '"message_id": 44');

    expect(
      await Promise.all([deliver(path, first, signed), deliver(path, second, signed)]),
    ).toEqual([200, 200]);

    const { conversations } = await owner.conversations.list({});

    expect(conversations).toHaveLength(1);

    const { messages } = await owner.conversations.messages.list({
      conversationId: conversations[0]?.id ?? '',
    });

    expect(messages).toHaveLength(2);
  });
});
