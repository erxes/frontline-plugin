import type * as Sdk from '@erxes/plugin-sdk';
import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';
import {
  channelFor,
  fakeProviders,
  fixture,
  serve as serveWebhooks,
  telegramApi,
  webhookOf,
} from '../../integrations/__tests__/fakes.ts';
import { asked } from '../../integrations/__tests__/standIns.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).coreStandIn(await importOriginal()),
);

// Core signs each event delivery; here the token `core-event` stands for its signature.
vi.mock('@erxes/plugin-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof Sdk>();
  const { sdkStandIn } = await import('../../integrations/__tests__/standIns.ts');

  return {
    ...sdkStandIn(actual),
    verifyCoreEvent: async (authorization: string | undefined, raw: string) => {
      if (authorization !== 'Bearer core-event') throw new Error('not signed by core');

      return actual.DeliveredEvent.parse(JSON.parse(raw));
    },
  };
});

const webhooks = serveWebhooks();
const api = serve('/api');
const messenger = serve('/api/public/messenger');

/** Core's `core.<kind>.merged`: `mergedIds` merged into `keptId`, delivered to `/api/events`. */
const merged = async (orgId: string, kind: string, keptId: string, mergedIds: string[]) => {
  const at = new Date().toISOString();
  const id = `event-${keptId}-${mergedIds.join('-')}`;
  const type = `core.${kind}.merged`;

  return (
    await api.post(
      '/events',
      {
        id,
        type,
        organizationId: orgId,
        createdAt: at,
        data: {
          id,
          source: 'core',
          type,
          version: 1,
          subjectType: kind,
          subjectId: keptId,
          entityType: kind,
          entityId: keptId,
          actorType: 'user',
          actorId: 'admin',
          payload: { mergedIds },
          summary: null,
          link: null,
          occurredAt: at,
          createdAt: at,
        },
      },
      'core-event',
    )
  ).status;
};

/** Telegram's update with message `id` from chat 4242. */
const fromBat = (id: number, text: string) =>
  JSON.stringify({
    update_id: 918274000 + id,
    message: {
      message_id: id,
      from: { id: 4242, is_bot: false, first_name: 'Bat' },
      chat: { id: 4242, type: 'private' },
      date: 1763180300 + id,
      text,
    },
  });

const Conversations = z.array(z.looseObject({ id: z.string(), customerId: z.string() }));

const Connected = z.looseObject({
  token: z.string(),
  conversations: z.array(z.looseObject({ id: z.string() })),
});

const Sent = z.object({ conversationId: z.string() });

describe('merged customers', () => {
  it('a Telegram sender merged into an existing customer writes on as that customer', async () => {
    const calls = fakeProviders(telegramApi);
    const owner = clientAs('org-mg-a');
    const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });
    const { path, signed } = webhookOf(calls);

    await channelFor('org-mg-a', 'telegram', account.id);
    expect(await webhooks.deliver(path, fixture('telegram-update.json'), signed)).toBe(200);

    const [first] = Conversations.parse((await owner.conversations.list({})).conversations);
    const lead = first?.customerId ?? '';

    // A member merges the lead Telegram made into Saraa, whom the team already knew.
    expect(await merged('org-mg-a', 'customer', 'customer-saraa', [lead])).toBe(204);
    // Core delivers again until it hears 2xx; a repeat changes nothing.
    expect(await merged('org-mg-a', 'customer', 'customer-saraa', [lead])).toBe(204);

    const before = asked.customers;

    expect(await webhooks.deliver(path, fromBat(77, 'Any news?'), signed)).toBe(200);

    // No new customer in core: the reply joins Saraa's one conversation.
    expect(asked.customers).toBe(before);

    const after = Conversations.parse((await owner.conversations.list({})).conversations);

    expect(after).toEqual([
      expect.objectContaining({ id: first?.id, customerId: 'customer-saraa' }),
    ]);

    const { messages } = await owner.conversations.messages.list({
      conversationId: first?.id ?? '',
    });

    expect(messages.map((message) => message.content)).toContain('Any news?');
  });

  it("a messenger visitor's token follows the merge, through a second one", async () => {
    const owner = clientAs('org-mg-b');
    const channel = await owner.channels.create({ name: 'Support' });

    const { publicKey: key } = await owner.integrations.create({
      channelId: channel.id,
      kind: 'messenger',
      name: 'Website',
      config: {},
    });

    const visitor = Connected.parse((await messenger.post('/connect', { key })).body);

    const conversationId = Sent.parse(
      (await messenger.post('/messages', { content: 'Hello' }, visitor.token)).body,
    ).conversationId;

    const [first] = Conversations.parse((await owner.conversations.list({})).conversations);
    const lead = first?.customerId ?? '';

    expect(await merged('org-mg-b', 'customer', 'customer-known', [lead])).toBe(204);
    expect(await merged('org-mg-b', 'customer', 'customer-final', ['customer-known'])).toBe(204);

    // The old token still finds the conversation, and comes back as a token for the kept customer.
    const back = Connected.parse(
      (await messenger.post('/connect', { key, token: visitor.token })).body,
    );

    expect(back.conversations.map((row) => row.id)).toEqual([conversationId]);
    expect(back.token).not.toBe(visitor.token);

    const again = Sent.parse(
      (await messenger.post('/messages', { content: 'Me again', conversationId }, visitor.token))
        .body,
    );

    expect(again.conversationId).toBe(conversationId);
    expect(Conversations.parse((await owner.conversations.list({})).conversations)).toEqual([
      expect.objectContaining({ id: conversationId, customerId: 'customer-final' }),
    ]);
  });

  it('refuses an event core did not sign', async () => {
    const response = await api.post('/events', { type: 'core.customer.merged' }, 'forged');

    expect(response.status).toBe(401);
  });
});
