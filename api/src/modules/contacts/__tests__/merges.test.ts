import type * as Sdk from '@erxes/plugin-sdk';
import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';
import {
  channelFor,
  fakeProviders,
  fixture,
  graphApi,
  lastPost,
  runQueued,
  serve as serveWebhooks,
  signedByMeta,
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

/** Meta's webhook with one Messenger message `mid` from `psid` to page-1. */
const fromPsid = (psid: string, mid: string) =>
  JSON.stringify({
    object: 'page',
    entry: [
      {
        id: 'page-1',
        time: 1763180000123,
        messaging: [
          {
            sender: { id: psid },
            recipient: { id: 'page-1' },
            timestamp: 1763180000001,
            message: { mid, text: 'Hello' },
          },
        ],
      },
    ],
  });

/** Telegram's update with message `id` from the private chat `chat`. */
const fromChat = (chat: number, id: number, text: string) =>
  JSON.stringify({
    update_id: 918274000 + chat + id,
    message: {
      message_id: id,
      from: { id: chat, is_bot: false, first_name: 'Bat' },
      chat: { id: chat, type: 'private' },
      date: 1763180300 + id,
      text,
    },
  });

const Conversations = z.array(
  z.looseObject({ id: z.string(), customerId: z.string(), externalId: z.string().nullable() }),
);

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

    expect(await webhooks.deliver(path, fromChat(4242, 77, 'Any news?'), signed)).toBe(200);

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

  it('reacts to each Facebook sender of a merged customer as that sender', async () => {
    const calls = fakeProviders(graphApi);
    const { owner } = await webhooks.connectMeta('org-mg-c', 'facebook');

    for (const [psid, mid] of [
      ['psid-phone', 'm_phone'],
      ['psid-laptop', 'm_laptop'],
    ] as const) {
      const raw = fromPsid(psid, mid);

      expect(await webhooks.deliver('/meta', raw, signedByMeta(raw))).toBe(200);
    }

    const rows = Conversations.parse((await owner.conversations.list({})).conversations);
    const phone = rows.find((row) => row.externalId === 'psid-phone');
    const laptop = rows.find((row) => row.externalId === 'psid-laptop');

    // Both senders are one person: the laptop's customer is kept, so it has both ids.
    expect(
      await merged('org-mg-c', 'customer', laptop?.customerId ?? '', [phone?.customerId ?? '']),
    ).toBe(204);

    const { messages } = await owner.conversations.messages.list({
      conversationId: phone?.id ?? '',
    });

    await owner.conversations.messages.react({ id: messages[0]?.id ?? '', emoji: '❤️' });
    await runQueued();

    // Not the laptop's id, though the customer has it too and it is newer.
    expect(lastPost(calls)?.body).toMatchObject({ recipient: { id: 'psid-phone' } });
  });

  it('follows a merge delivered late, and a ticket written with a merged company', async () => {
    const owner = clientAs('org-mg-d');
    const channel = await owner.channels.create({ name: 'Support' });
    const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Main' });

    const ticket = await owner.tickets.create({
      pipelineId: pipeline.id,
      name: 'Refund',
      companyId: 'acme-old',
    });

    // Core merged acme-old into acme, then acme into acme-group; the second event came first.
    expect(await merged('org-mg-d', 'company', 'acme-group', ['acme'])).toBe(204);
    expect(await merged('org-mg-d', 'company', 'acme', ['acme-old'])).toBe(204);

    expect(await owner.tickets.get({ id: ticket.id })).toMatchObject({ companyId: 'acme-group' });

    // A ticket filed with a merged id, as by a screen opened before the merge, names the kept one.
    const late = await owner.tickets.create({
      pipelineId: pipeline.id,
      name: 'Late',
      companyId: 'acme-old',
    });

    expect(late.companyId).toBe('acme-group');
  });

  it("closes a merged visitor's stream and keeps their pending upload", async () => {
    fakeProviders(telegramApi);

    const owner = clientAs('org-mg-e');
    const channel = await owner.channels.create({ name: 'Support' });

    const { publicKey: key } = await owner.integrations.create({
      channelId: channel.id,
      kind: 'messenger',
      name: 'Website',
      config: {},
    });

    const { token } = Connected.parse((await messenger.post('/connect', { key })).body);

    const conversationId = Sent.parse(
      (await messenger.post('/messages', { content: 'Hello' }, token)).body,
    ).conversationId;

    const [first] = Conversations.parse((await owner.conversations.list({})).conversations);

    const uploaded = await fetch(messenger.url('/files'), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'text/plain',
        'x-file-name': 'invoice.txt',
      },
      body: 'invoice',
    });

    const { receipt } = z.object({ receipt: z.string() }).parse(await uploaded.json());

    const stream = await fetch(messenger.url(`/stream?token=${token}`));
    const reader = stream.body?.getReader();

    await reader?.read();
    expect(await merged('org-mg-e', 'customer', 'customer-kept', [first?.customerId ?? ''])).toBe(
      204,
    );

    // The stream ends; the browser opens it again, as the kept customer.
    const ended = async (): Promise<boolean> => {
      const chunk = await reader?.read();

      return !chunk || chunk.done || ended();
    };

    expect(await ended()).toBe(true);

    const sent = await messenger.post(
      '/messages',
      { conversationId, content: 'The invoice', files: [receipt] },
      token,
    );

    expect(sent.status).toBe(201);
  });

  it('refuses an event core did not sign', async () => {
    const response = await api.post('/events', { type: 'core.customer.merged' }, 'forged');

    expect(response.status).toBe(401);
  });
});
