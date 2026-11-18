import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import type * as CoreModule from '#/core.ts';
import { PERMISSIONS } from '#/core.ts';
import { pool, withOrg } from '#/db/client.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';

// Tests never reach core: the customers a visitor becomes and the notifications members get
// come from this stand-in.
const created = vi.hoisted(() => ({ customers: 0, notifications: [] as unknown[] }));

vi.mock('#/core.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();

  return {
    ...actual,
    core: {
      ...actual.core,
      forOrg: () => ({
        customers: {
          create: async () => {
            created.customers += 1;

            return { id: `customer-${created.customers}` };
          },
        },
        notifications: {
          create: async (input: unknown) => {
            created.notifications.push(input);

            return { ok: true };
          },
        },
      }),
    },
  };
});

const { post, get, url } = serve('/api/public/messenger');

const agent = [PERMISSIONS.inboxView, PERMISSIONS.channelView];

/** An organisation's owner, a channel with `teammate` in it and its messenger, and a visitor's token. */
const setUp = async (orgId: string) => {
  const owner = clientAs(orgId);
  const channel = await owner.channels.create({ name: 'Support', memberIds: ['teammate'] });

  const integration = await owner.integrations.create({
    channelId: channel.id,
    kind: 'messenger',
    name: 'Website',
    config: { welcome: 'Hi there' },
  });

  const connected = await post('/connect', { key: integration.publicKey });

  return {
    owner,
    teammate: clientAs(orgId, agent, 'teammate'),
    outsider: clientAs(orgId, agent, 'outsider'),
    channel,
    integration,
    token: Connected.parse(connected.body).token,
    connected,
  };
};

/** What `/connect` answers, as far as these tests read it. */
const Connected = z.looseObject({ token: z.string(), conversations: z.array(z.unknown()) });

/** One read of the event stream. */
const Chunk = z.instanceof(Uint8Array);

/** What `core_live_signal()` sends on `core_live`: the organisation and the topic. */
const LiveSignal = z.looseObject({ o: z.string(), t: z.string() });

/** The filter bar's one rule, as `useListFilterParams()` sends it. */
const rule = (path: string, op: string, value?: unknown) =>
  JSON.stringify({ match: 'all', rules: [{ path: `subject.${path}`, op, value }] });

describe('inbox', () => {
  it('starts a conversation from a messenger visitor that the channel works', async () => {
    const { owner, teammate, outsider, integration, token, connected } = await setUp('org-ib-a');

    expect(connected.status).toBe(200);
    expect(connected.body).toMatchObject({
      messenger: { name: 'Website', welcome: 'Hi there', color: '#4F46E5' },
      conversations: [],
    });

    const sent = await post('/messages', { content: 'My order is late' }, token);

    expect(sent.status).toBe(201);

    const { conversations, totalCount } = await teammate.conversations.list({});

    expect(totalCount).toBe(1);
    expect(conversations[0]).toMatchObject({
      integrationId: integration.id,
      kind: 'messenger',
      integrationName: 'Website',
      channelName: 'Support',
      status: 'new',
      content: 'My order is late',
      messageCount: 1,
      customerRespondedLast: true,
      isRead: false,
      tagIds: [],
    });
    expect(conversations[0]).not.toHaveProperty('orgId');
    expect(conversations[0]).not.toHaveProperty('readBy');

    // Someone outside the channel sees nothing; the owner manages every channel.
    expect((await outsider.conversations.list({})).totalCount).toBe(0);
    expect((await owner.conversations.list({})).totalCount).toBe(1);
    await expect(clientAs('org-ib-other').conversations.list({})).resolves.toMatchObject({
      totalCount: 0,
    });

    // The same token keeps the visitor; a second message lands in the same conversation.
    const id = conversations[0]?.id ?? '';
    const again = await post('/connect', { key: integration.publicKey, token });

    expect(Connected.parse(again.body)).toMatchObject({ token, conversations: [{ id }] });
    await post('/messages', { conversationId: id, content: 'Any news?' }, token);
    expect(await teammate.conversations.get({ id })).toMatchObject({ messageCount: 2 });

    // The conversation started on the customer's timeline.
    const events = await withOrg('org-ib-a', (tx) =>
      tx.execute(sql`select type, subject_id, entity_id from core_events where entity_id = ${id}`),
    );

    expect(events.rows).toEqual([
      { type: 'frontline.conversation.started', subject_id: 'customer-1', entity_id: id },
    ]);
  });

  it('sends replies to the visitor and keeps internal notes in the inbox', async () => {
    const { teammate, token } = await setUp('org-ib-b');

    await post('/messages', { content: 'Hello?' }, token);

    const [conversation] = (await teammate.conversations.list({})).conversations;
    const id = conversation?.id ?? '';

    const reply = await teammate.conversations.messages.create({
      conversationId: id,
      content: 'Hi, how can we help?',
    });

    const note = await teammate.conversations.messages.create({
      conversationId: id,
      content: 'Looks like a refund',
      internal: true,
      mentionedUserIds: ['user-org-ib-b'],
    });

    expect(reply).toMatchObject({ userId: 'teammate', deliveryStatus: 'sent', internal: false });
    expect(note).toMatchObject({ deliveryStatus: null, internal: true });
    expect(await teammate.conversations.get({ id })).toMatchObject({
      status: 'open',
      content: 'Hi, how can we help?',
      customerRespondedLast: false,
      firstRespondedBy: 'teammate',
      participantIds: ['teammate'],
      isRead: true,
      messageCount: 2,
    });
    expect(created.notifications).toContainEqual(
      expect.objectContaining({
        kind: 'frontline.conversation.mentioned',
        userIds: ['user-org-ib-b'],
      }),
    );

    const seen = await get(`/conversations/${id}/messages`, token);

    expect(seen.body).toEqual([
      expect.objectContaining({ content: 'Hello?', fromVisitor: true }),
      expect.objectContaining({ content: 'Hi, how can we help?', fromVisitor: false }),
    ]);

    const { messages } = await teammate.conversations.messages.list({ conversationId: id });

    expect(messages.map((message) => message.content)).toEqual([
      'Looks like a refund',
      'Hi, how can we help?',
      'Hello?',
    ]);

    await expect(
      teammate.conversations.messages.create({ conversationId: id, content: '  ' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('keeps a member’s rich text safe, with its plain text and the members it mentions', async () => {
    const { teammate, token } = await setUp('org-ib-rich');

    await post('/messages', { content: 'Where is it?' }, token);

    const [conversation] = (await teammate.conversations.list({})).conversations;
    const id = conversation?.id ?? '';

    const note = await teammate.conversations.messages.create({
      conversationId: id,
      internal: true,
      html:
        '<p>Ask <span data-inline-content-type="mention" data-_id="owner-rich" data-full-name="Olivia">@Olivia</span>' +
        ' about <strong>refunds</strong><img src="x" onerror="alert(1)"><script>alert(2)</script></p>',
    });

    expect(note).toMatchObject({
      content: 'Ask @Olivia about refunds',
      html: '<p>Ask <span data-inline-content-type="mention" data-_id="owner-rich" data-full-name="Olivia">@Olivia</span> about <strong>refunds</strong></p>',
      mentionedUserIds: ['owner-rich'],
    });
    expect(created.notifications).toContainEqual(
      expect.objectContaining({
        kind: 'frontline.conversation.mentioned',
        userIds: ['owner-rich'],
      }),
    );

    // The visitor reads a rich reply as its text.
    await teammate.conversations.messages.create({
      conversationId: id,
      html: '<p>It ships <em>today</em>.</p><ul><li>Tracking follows</li></ul>',
    });

    expect((await get(`/conversations/${id}/messages`, token)).body).toContainEqual(
      expect.objectContaining({ content: 'It ships today.\n\n * Tracking follows' }),
    );

    // Formatting with no words in it is no message.
    await expect(
      teammate.conversations.messages.create({ conversationId: id, html: '<p><br></p>' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('assigns, resolves and reopens when the customer writes again', async () => {
    const { owner, teammate, token } = await setUp('org-ib-c');

    await post('/messages', { content: 'Broken link' }, token);

    const [conversation] = (await teammate.conversations.list({})).conversations;
    const id = conversation?.id ?? '';

    await owner.conversations.assign({ ids: [id], assigneeId: 'teammate' });
    expect(created.notifications).toContainEqual(
      expect.objectContaining({ kind: 'frontline.conversation.assigned', userIds: ['teammate'] }),
    );

    const mine = await teammate.conversations.list({ filter: rule('assigneeId', 'eq', 'me') });

    expect(mine.totalCount).toBe(1);

    await teammate.conversations.setStatus({ ids: [id], status: 'resolved' });

    // Resolved conversations leave the default list and show when the filter asks for them.
    expect((await teammate.conversations.list({})).totalCount).toBe(0);
    expect(
      (await teammate.conversations.list({ filter: rule('status', 'eq', 'resolved') }))
        .conversations,
    ).toEqual([expect.objectContaining({ id, resolvedBy: 'teammate' })]);

    await teammate.conversations.markRead({ id });
    await post('/messages', { conversationId: id, content: 'Still broken' }, token);

    expect(await teammate.conversations.get({ id })).toMatchObject({
      status: 'open',
      resolvedAt: null,
      isRead: false,
      assigneeId: 'teammate',
    });
  });

  it('refuses forged visitors, unknown keys and other visitors’ conversations', async () => {
    const { integration, token, teammate } = await setUp('org-ib-e');

    await post('/messages', { content: 'Mine' }, token);

    const [conversation] = (await teammate.conversations.list({})).conversations;

    const other = Connected.parse(
      (await post('/connect', { key: integration.publicKey })).body,
    ).token;

    expect((await post('/connect', { key: 'nope' })).status).toBe(404);
    expect((await post('/messages', { content: 'x' }, 'forged')).status).toBe(401);
    expect((await get(`/conversations/${conversation?.id}/messages`, other)).status).toBe(404);
    expect(
      (await post('/messages', { conversationId: conversation?.id, content: 'x' }, other)).status,
    ).toBe(404);
  });

  it('streams a change to the visitor when the team replies', async () => {
    const { teammate, token } = await setUp('org-ib-f');

    await post('/messages', { content: 'Ping' }, token);

    const [conversation] = (await teammate.conversations.list({})).conversations;
    const id = conversation?.id ?? '';
    const controller = new AbortController();

    const response = await fetch(url(`/stream?token=${encodeURIComponent(token)}`), {
      signal: controller.signal,
    });

    const reader = response.body?.getReader();

    expect(response.headers.get('content-type')).toBe('text/event-stream');

    const decoder = new TextDecoder();
    const first = await reader?.read();

    expect(decoder.decode(Chunk.parse(first?.value))).toContain('connected');

    await teammate.conversations.messages.create({ conversationId: id, content: 'Pong' });

    const next = await reader?.read();

    expect(decoder.decode(Chunk.parse(next?.value))).toBe(
      `event: changed\ndata: ${JSON.stringify({ conversationId: id })}\n\n`,
    );
    controller.abort();
  });

  it('signals the inbox and the changed conversation once each when a change commits', async () => {
    const { teammate, token } = await setUp('org-ib-live');

    await post('/messages', { content: 'Ping' }, token);

    const [conversation] = (await teammate.conversations.list({})).conversations;
    const id = conversation?.id ?? '';
    const topics: string[] = [];
    const listener = await pool.connect();

    listener.on('notification', ({ payload }) => {
      const signal = LiveSignal.parse(JSON.parse(payload ?? '{}'));

      if (signal.o === 'org-ib-live') topics.push(signal.t);
    });
    await listener.query('LISTEN core_live');

    await teammate.conversations.messages.create({ conversationId: id, content: 'Pong' });
    await vi.waitFor(() => expect(topics.length).toBeGreaterThan(0));
    await listener.query('UNLISTEN core_live');
    listener.removeAllListeners('notification');
    listener.release();

    expect(topics.toSorted()).toEqual(['conversation.' + id.toLowerCase(), 'conversations']);
  });

  it('checks a messenger’s settings and lets only channel admins connect one', async () => {
    const { channel, teammate, owner, integration } = await setUp('org-ib-g');

    await expect(
      owner.integrations.create({
        channelId: channel.id,
        kind: 'messenger',
        name: 'Bad',
        config: { color: 'red' },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      owner.integrations.create({ channelId: channel.id, kind: 'pigeon', name: 'Coo' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      teammate.integrations.create({ channelId: channel.id, kind: 'messenger', name: 'Mine' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(await teammate.integrations.list({})).toEqual([
      expect.objectContaining({ id: integration.id, canManage: false }),
    ]);

    // A paused messenger takes no visitors.
    await owner.integrations.update({ id: integration.id, isActive: false });
    expect((await post('/connect', { key: integration.publicKey })).status).toBe(404);

    await owner.integrations.remove({ id: integration.id });
    expect(await owner.integrations.list({})).toEqual([]);
  });
});
