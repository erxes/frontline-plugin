import { describe, expect, it, vi } from 'vite-plus/test';
import { clientAs } from '#/test/member.ts';
import {
  channelFor,
  conversationWith,
  fakeProviders,
  fixture,
  runQueued,
  serve,
  telegramApi,
  webhookOf,
} from './fakes.ts';
import { asked } from './standIns.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

const { deliver, coreEvent } = serve();

/** What frontline gave core's agent in conversation `key`. */
const agentGot = (key: string) => asked.submitted.filter((each) => each.key === key);

describe('a telegram bot’s core agent', () => {
  it('lets an AI agent answer a private chat, with the link of what it showed, but not a group', async () => {
    const calls = fakeProviders(telegramApi);
    const owner = clientAs('org-tg-agent');
    const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });
    const { path, signed } = webhookOf(calls);
    const integration = await channelFor('org-tg-agent', 'telegram', account.id);

    await owner.integrations.setAgent({ id: integration.id, agentId: 'agent-1' });

    const group = JSON.stringify({
      update_id: 918273200,
      message: {
        message_id: 60,
        from: { id: 5151, is_bot: false, first_name: 'Saraa' },
        chat: { id: -100777, type: 'group', title: 'Shop fans' },
        date: 1763180400,
        text: 'Anyone here?',
      },
    });

    expect(await deliver(path, fixture('telegram-update.json'), signed)).toBe(200);
    expect(await deliver(path, group, signed)).toBe(200);

    const chat = await conversationWith('org-tg-agent', '4242');
    const groupChat = await conversationWith('org-tg-agent', '-100777');

    expect(agentGot(chat)).toMatchObject([{ text: 'Hello, is my order on its way?' }]);
    expect(agentGot(groupChat)).toEqual([]);

    // Telegram shows no markdown and no cards: the answer goes as text, the payment as its link.
    await coreEvent('org-tg-agent', 'event-tg-answer', 'core.agent.finished', {
      agentId: 'agent-1',
      plugin: 'frontline',
      key: chat,
      answer: '**Yes**, it ships today.',
      blocks: [
        {
          kind: 'payment',
          title: 'Your order',
          amount: '45,000₮',
          url: 'https://pay.example.mn/1',
        },
      ],
    });
    await runQueued();

    expect(calls.at(-1)?.body).toEqual({
      chat_id: '4242',
      text: 'Yes, it ships today.\n\nYour order · 45,000₮\nhttps://pay.example.mn/1',
    });
  });
});
