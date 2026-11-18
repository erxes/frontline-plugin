import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import type * as CoreModule from '#/core.ts';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import type * as FilesModule from '#/modules/files.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';
import type * as Sdk from '@erxes/plugin-sdk';

// Tests never reach core: customers, members and notifications come from this stand-in, and
// core's automation calls carry the token `core`.
const core = vi.hoisted(() => ({ customers: 0 }));

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

// Core's storage, by file id: what a visitor uploads, and what reading it back gives.
const stored = vi.hoisted(() => new Map<string, string>());

vi.mock('#/modules/files.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesModule>()),
  storeFile: async (_orgId: string, file: { name: string; bytes: Uint8Array }) => {
    stored.set(`file-${stored.size + 1}`, Buffer.from(file.bytes).toString());

    return { url: `/core/v1/files/file-${stored.size}/download`, name: file.name };
  },
  readFile: async (_orgId: string, id: string) => {
    const body = new Blob([stored.get(id) ?? '']);

    return { name: 'note.txt', contentType: 'text/plain', size: body.size, body: body.stream() };
  },
}));

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
  conversations: z.array(z.looseObject({ id: z.string() })),
});

/** What `/connect` answers a visitor who sends `body`. */
const connect = async (body: Record<string, unknown>) =>
  Connected.parse((await messenger.post('/connect', body)).body);

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

  const key = integration.publicKey;
  const connected = await connect({ key });

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
  it('saves its settings and shows visitors them with its team', async () => {
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

    const connected = await connect({ key });

    expect(connected.messenger).toMatchObject({
      greetingTitle: 'Hello',
      heroStyle: 'glossy',
      supporters: [
        { id: 'u2', name: 'Name of u2' },
        { id: 'u1', name: 'Name of u1' },
      ],
    });
    expect(connected.messenger).not.toHaveProperty('supporterIds');

    // A page reads them before the visitor opens the messenger, which makes no customer.
    const customers = core.customers;

    expect((await messenger.get(`/settings?key=${key}`)).body).toMatchObject({
      messenger: { greetingTitle: 'Hello', supporters: [{ id: 'u2' }, { id: 'u1' }] },
    });
    expect(core.customers).toBe(customers);
    expect((await messenger.get('/settings?key=nope')).status).toBe(404);

    const settings = await owner.integrations.messenger.settings({ id: integration.id });

    expect(settings).toMatchObject({
      canManage: true,
      config: { greetingTitle: 'Hello', color: '#4F46E5' },
    });
    expect(settings.scriptUrl?.endsWith(`/widget/messenger.js?key=${key}`)).toBe(true);

    const outsider = clientAs('org-ms-a', [PERMISSIONS.channelView], 'outsider');

    await expect(
      outsider.integrations.messenger.settings({ id: integration.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('serves a visitor the files of their conversations, attached only by receipt', async () => {
    const { key, token } = await setUp('org-ms-g');

    const Uploaded = z.object({ url: z.string(), name: z.string(), receipt: z.string() });
    const fileUrl = (id: string, as: string) => messenger.url(`/files/${id}?token=${as}`);

    const sent = await fetch(messenger.url('/files'), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'text/plain',
        'x-file-name': encodeURIComponent('Счёт.txt'),
      },
      body: 'invoice',
    });

    const file = Uploaded.parse(await sent.json());
    const id = /file-\d+/.exec(file.url)?.[0] ?? '';

    expect(file.name).toBe('Счёт.txt');
    // Until a message carries it, nobody reads it.
    expect((await fetch(fileUrl(id, token))).status).toBe(404);

    expect((await messenger.post('/messages', { files: [file.receipt] }, token)).status).toBe(201);

    const read = await fetch(fileUrl(id, token));

    expect([read.status, await read.text()]).toEqual([200, 'invoice']);
    expect(read.headers.get('content-disposition')).toContain('attachment');

    // Another visitor can't attach it, by its receipt or its address, so never reads it.
    const { token: other } = await connect({ key });

    expect((await messenger.post('/messages', { files: [file.receipt] }, other)).status).toBe(400);
    expect((await messenger.post('/messages', { files: [other] }, other)).status).toBe(400);
    await messenger.post('/messages', { content: 'Mine', attachments: [file] }, other);
    expect((await fetch(fileUrl(id, other))).status).toBe(404);
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
    expect((await teammate.conversations.counts({})).unread).toBe(1);

    await teammate.conversations.messages.create({ conversationId: id, content: 'Hello!' });
    await teammate.conversations.messages.create({
      conversationId: id,
      content: 'Note',
      internal: true,
    });

    expect((await teammate.conversations.counts({})).unread).toBe(0);
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

    const Page = z.object({
      items: z.array(z.object({ content: z.string(), fromVisitor: z.boolean() })),
      nextCursor: z.string().nullable(),
    });

    // Newest first, a page at a time.
    const latest = Page.parse(
      (await messenger.get(`/conversations/${id}/messages?limit=1`, token)).body,
    );

    expect(latest.items).toEqual([
      { content: 'A person from the team will answer you here.', fromVisitor: false },
    ]);

    const earlier = Page.parse(
      (
        await messenger.get(
          `/conversations/${id}/messages?limit=1&cursor=${latest.nextCursor ?? ''}`,
          token,
        )
      ).body,
    );

    expect(earlier).toEqual({
      items: [{ content: 'I want a human', fromVisitor: true }],
      nextCursor: null,
    });

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

    const action = (type: string, input: Record<string, unknown>, key = 'r1:s1', as = 'core') =>
      fetch(api.url(`/automations/actions/${type}`), {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${as}`,
          'idempotency-key': key,
        },
        body: JSON.stringify({ input, context: { event } }),
      });

    expect((await action('frontline.conversation.reply', { content: 'On its way' })).status).toBe(
      200,
    );
    // A retried step sends nothing twice.
    await action('frontline.conversation.reply', { content: 'On its way' });
    // The bot's answer ends the customer's wait.
    expect(await teammate.conversations.get({ id })).toMatchObject({
      messageCount: 2,
      content: 'On its way',
      customerRespondedLast: false,
    });

    /** The ids of the conversations the inbox's filter bar finds with `path` set to `value`. */
    const found = async (path: string, value: boolean) =>
      (
        await teammate.conversations.list({
          filter: JSON.stringify({ match: 'all', rules: [{ path, op: 'eq', value }] }),
        })
      ).conversations.map((conversation) => conversation.id);

    expect(await found('subject.botReplied', true)).toEqual([id]);
    expect(await found('subject.handedOff', true)).toEqual([]);

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
    expect(await found('subject.handedOff', true)).toEqual([id]);
    expect(await found('subject.handedOff', false)).toEqual([]);

    // Once a person has it, the bot stays quiet.
    const quiet = await action('frontline.conversation.reply', { content: 'Bot again' }, 'r2:s1');

    expect(await quiet.json()).toEqual({ sent: false });

    const forged = await action('frontline.conversation.reply', {}, 'r3:s1', 'forged');

    expect(forged.status).toBe(401);
    expect((await action('frontline.nothing', {})).status).toBe(404);
  });
});
