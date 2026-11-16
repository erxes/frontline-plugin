import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import type * as CoreModule from '#/core.ts';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';
import type * as Sdk from '@erxes/plugin-sdk';
import { isOnlineAt, MessengerConfig } from '../adapter.ts';

// Tests never reach core: customers, members and notifications come from this stand-in, and
// core's automation calls carry the token `core`.
const core = vi.hoisted(() => ({ customers: 0, found: new Map<string, string>() }));

vi.mock('#/core.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();

  return {
    ...actual,
    core: {
      ...actual.core,
      forOrg: () => ({
        customers: {
          create: async () => {
            core.customers += 1;

            return { id: `customer-${core.customers}` };
          },
          findOrCreate: async ({ primaryEmail }: { primaryEmail?: string }) => {
            const id = core.found.get(primaryEmail ?? '') ?? `lead-${primaryEmail}`;

            return { customer: { id }, created: !core.found.has(primaryEmail ?? '') };
          },
        },
        users: {
          list: async ({ ids }: { ids: string }) => ({
            data: ids
              .split(',')
              .map((id) => ({ id, fullName: `Name of ${id}`, username: id, avatarUrl: null })),
          }),
        },
        notifications: { create: async () => ({ ok: true }) },
      }),
    },
  };
});

vi.mock('@erxes/plugin-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof Sdk>();

  return {
    ...actual,
    verifyCoreCall: async (token: string) => {
      if (token !== 'core') throw new Error('not core');

      return {
        orgId: 'org-ms-auto',
        userId: 'owner',
        automationId: 'a1',
        runId: 'r1',
        stepId: 's1',
      };
    },
  };
});

const messenger = serve('/api/public/messenger');
const api = serve('/api');

const Connected = z.looseObject({
  token: z.string(),
  identified: z.boolean(),
  messenger: z.looseObject({ isOnline: z.boolean(), supporters: z.array(z.unknown()) }),
});

const Sent = z.object({ conversationId: z.string() });

const VisitorConversations = z.array(
  z.object({ id: z.string(), operator: z.string(), unreadCount: z.number() }),
);

/** An owner, a channel with `teammate`, its messenger with `config`, and a connected visitor. */
const setUp = async (orgId: string, config: Record<string, unknown> = {}) => {
  const owner = clientAs(orgId);
  const channel = await owner.channels.create({ name: 'Support', memberIds: ['teammate'] });

  const integration = await owner.integrations.create({
    channelId: channel.id,
    kind: 'messenger',
    name: 'Website',
    config,
  });

  const key = integration.publicKey ?? '';
  const connected = Connected.parse((await messenger.post('/connect', { key })).body);

  return {
    owner,
    teammate: clientAs(orgId, [PERMISSIONS.inboxView, PERMISSIONS.channelView], 'teammate'),
    integration,
    key,
    connected,
    token: connected.token,
  };
};

const write = async (token: string, content: string, conversationId?: string) =>
  Sent.parse((await messenger.post('/messages', { content, conversationId }, token)).body)
    .conversationId;

describe('messenger', () => {
  it('saves its settings and tells visitors when the team is online', async () => {
    const { owner, integration, key } = await setUp('org-ms-a', {
      greetingTitle: 'Hello',
      supporterIds: ['u2', 'u1'],
      availability: 'auto',
      timezone: 'Asia/Ulaanbaatar',
      onlineHours: [{ day: 'weekdays', from: '09:00', to: '18:00' }],
    });

    await expect(
      owner.integrations.update({ id: integration.id, config: { timezone: 'Mars/Olympus' } }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const connected = Connected.parse((await messenger.post('/connect', { key })).body);

    expect(connected.messenger).toMatchObject({
      greetingTitle: 'Hello',
      heroStyle: 'glossy',
      supporters: [
        { id: 'u2', name: 'Name of u2' },
        { id: 'u1', name: 'Name of u1' },
      ],
    });
    expect(connected.messenger).not.toHaveProperty('supporterIds');

    await expect(
      owner.integrations.messenger.settings({ id: integration.id }),
    ).resolves.toMatchObject({
      canManage: true,
      config: { greetingTitle: 'Hello', color: '#4F46E5' },
    });

    const outsider = clientAs('org-ms-a', [PERMISSIONS.channelView], 'outsider');

    await expect(
      outsider.integrations.messenger.settings({ id: integration.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    // 10:00 on a Monday in Ulaanbaatar is 02:00 UTC; Saturday is off.
    const config = MessengerConfig.parse(integration.config);

    expect(isOnlineAt(config, new Date('2026-11-16T02:00:00Z'))).toBe(true);
    expect(isOnlineAt(config, new Date('2026-11-16T11:00:00Z'))).toBe(false);
    expect(isOnlineAt(config, new Date('2026-11-21T02:00:00Z'))).toBe(false);
    expect(isOnlineAt({ ...config, availability: 'manual', isOnline: false }, new Date())).toBe(
      false,
    );
  });

  it('asks for an email first when it requires one, then moves the visitor’s conversations', async () => {
    const { owner, teammate, integration, key, token } = await setUp('org-ms-b');

    const before = await write(token, 'Anonymous question');

    await owner.integrations.update({ id: integration.id, config: { requireAuth: true } });
    expect((await messenger.post('/messages', { content: 'Again' }, token)).status).toBe(403);

    core.found.set('ann@example.com', 'customer-ann');

    const identified = Connected.parse(
      (
        await messenger.post('/connect', {
          key,
          token,
          identity: { email: 'ann@example.com', firstName: 'Ann' },
        })
      ).body,
    );

    expect(identified.identified).toBe(true);
    expect(await teammate.conversations.get({ id: before })).toMatchObject({
      customerId: 'customer-ann',
    });
    expect(await write(identified.token, 'Now with my email', before)).toBe(before);
    expect(
      (await messenger.post('/connect', { key, identity: { firstName: 'No contact' } })).status,
    ).toBe(400);
  });

  it('keeps visitor sessions and counts the replies a visitor hasn’t read', async () => {
    const { teammate, key, token } = await setUp('org-ms-c');
    const id = await write(token, 'Hi');

    await messenger.post('/connect', { key, token, browser: { url: 'https://shop.test/cart' } });
    await messenger.post('/browser', { url: 'https://shop.test/pay', language: 'mn' }, token);

    expect(await teammate.conversations.visitor({ id })).toMatchObject({
      sessionCount: 2,
      isOnline: false,
      browser: { url: 'https://shop.test/pay', language: 'mn' },
    });
    expect(await teammate.conversations.unreadCount({})).toEqual({ count: 1 });

    await teammate.conversations.messages.create({ conversationId: id, content: 'Hello!' });
    await teammate.conversations.messages.create({
      conversationId: id,
      content: 'Note',
      internal: true,
    });

    expect(await teammate.conversations.unreadCount({})).toEqual({ count: 0 });
    expect(VisitorConversations.parse((await messenger.get('/conversations', token)).body)).toEqual(
      [expect.objectContaining({ id, unreadCount: 1 })],
    );

    await messenger.post(`/conversations/${id}/read`, {}, token);
    expect(VisitorConversations.parse((await messenger.get('/conversations', token)).body)).toEqual(
      [expect.objectContaining({ unreadCount: 0 })],
    );
    expect((await messenger.post(`/conversations/${id}/typing`, {}, token)).status).toBe(204);
  });

  it('hands a conversation to a person when the visitor asks, and back to the bot', async () => {
    const { teammate, token } = await setUp('org-ms-d');
    const id = await write(token, 'I want a human');

    expect(await teammate.conversations.get({ id })).toMatchObject({ operator: 'bot' });
    expect((await messenger.post(`/conversations/${id}/person`, {}, token)).status).toBe(204);
    expect(await teammate.conversations.get({ id })).toMatchObject({ operator: 'person' });

    // Asking twice tells the visitor once.
    await messenger.post(`/conversations/${id}/person`, {}, token);

    const seen = z
      .array(z.object({ content: z.string(), fromVisitor: z.boolean() }))
      .parse((await messenger.get(`/conversations/${id}/messages`, token)).body);

    expect(seen).toEqual([
      { content: 'I want a human', fromVisitor: true },
      { content: 'A person from the team will answer you here.', fromVisitor: false },
    ]);

    await teammate.conversations.setOperator({ ids: [id], operator: 'bot' });
    expect(await teammate.conversations.get({ id })).toMatchObject({ operator: 'bot' });
  });

  it('publishes each customer message for automations, with no timeline entry', async () => {
    const { token } = await setUp('org-ms-e');
    const id = await write(token, 'Trigger me');

    const events = await withOrg('org-ms-e', (tx) =>
      tx.execute(sql`select subject_type, entity_id, payload from core_events
        where type = 'frontline.conversation.message_received' and org_id = 'org-ms-e'`),
    );

    expect(events.rows).toMatchObject([
      {
        subject_type: null,
        entity_id: null,
        payload: { conversationId: id, kind: 'messenger', operator: 'bot', content: 'Trigger me' },
      },
    ]);
  });

  it('runs the reply and hand-off actions for core’s automations', async () => {
    const { teammate, token } = await setUp('org-ms-auto');
    const id = await write(token, 'Where is my parcel?');
    const event = { payload: { conversationId: id } };

    const action = (type: string, input: Record<string, unknown>, key = 'r1:s1') =>
      fetch(api.url(`/automations/actions/${type}`), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer core',
          'idempotency-key': key,
        },
        body: JSON.stringify({ input, context: { event } }),
      });

    expect((await action('frontline.conversation.reply', { content: 'On its way' })).status).toBe(
      200,
    );
    // A retried step sends nothing twice.
    await action('frontline.conversation.reply', { content: 'On its way' });
    expect(await teammate.conversations.get({ id })).toMatchObject({
      messageCount: 2,
      content: 'On its way',
    });

    const handed = await action(
      'frontline.conversation.hand_off',
      { assigneeIds: ['teammate'] },
      'r1:s2',
    );

    expect(await handed.json()).toEqual({ operator: 'person', assigneeId: 'teammate' });
    expect(await teammate.conversations.get({ id })).toMatchObject({
      operator: 'person',
      assigneeId: 'teammate',
    });

    // Once a person has it, the bot stays quiet.
    const quiet = await action('frontline.conversation.reply', { content: 'Bot again' }, 'r2:s1');

    expect(await quiet.json()).toEqual({ sent: false });

    const forged = await fetch(api.url('/automations/actions/frontline.conversation.reply'), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer forged' },
      body: '{}',
    });

    expect(forged.status).toBe(401);
    expect((await action('frontline.nothing', {})).status).toBe(404);
  });
});
