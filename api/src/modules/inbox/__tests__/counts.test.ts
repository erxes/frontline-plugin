import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import type * as CoreModule from '#/core.ts';
import { PERMISSIONS } from '#/core.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';

// Tests never reach core: each visitor becomes a customer of this stand-in, and notifications go
// nowhere.
const created = vi.hoisted(() => ({ customers: 0 }));

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
        notifications: { create: async () => ({ ok: true }) },
      }),
    },
  };
});

const { post } = serve('/api/public/messenger');

const Connected = z.looseObject({ token: z.string() });

/** The filter bar's one rule, as `useListFilterParams()` sends it. */
const rule = (path: string, op: string, value?: unknown) =>
  JSON.stringify({ match: 'all', rules: [{ path: `subject.${path}`, op, value }] });

describe('inbox counts', () => {
  it('counts what waits unread in each sidebar queue and channel', async () => {
    const owner = clientAs('org-ib-counts');

    const teammate = clientAs(
      'org-ib-counts',
      [PERMISSIONS.inboxView, PERMISSIONS.channelView],
      'teammate',
    );

    const channel = await owner.channels.create({ name: 'Support', memberIds: ['teammate'] });

    const integration = await owner.integrations.create({
      channelId: channel.id,
      kind: 'messenger',
      name: 'Website',
      config: {},
    });

    const { token } = Connected.parse(
      (await post('/connect', { key: integration.publicKey })).body,
    );

    await post('/messages', { content: 'First' }, token);
    await post('/messages', { content: 'Second' }, token);

    const { conversations } = await teammate.conversations.list({});
    const [second, first] = conversations.map((conversation) => conversation.id);

    expect(await teammate.conversations.counts({})).toEqual({
      unread: 2,
      assignedToMe: 0,
      mentioned: 0,
      unassigned: 2,
      awaitingResponse: 2,
      channels: [{ id: channel.id, name: 'Support', icon: null, unread: 2 }],
    });

    // Assigned to them, and mentioned in another's note: each queue counts its own.
    await owner.conversations.assign({ ids: [first ?? ''], assigneeId: 'teammate' });
    await owner.conversations.messages.create({
      conversationId: second ?? '',
      content: '@Teammate can you look?',
      internal: true,
      mentionedUserIds: ['teammate'],
    });

    expect(await teammate.conversations.counts({})).toMatchObject({
      unread: 2,
      assignedToMe: 1,
      mentioned: 1,
      unassigned: 1,
    });

    // The Mentions queue's link filters the list by the same rule.
    const mentioning = await teammate.conversations.list({
      filter: rule('mentionedUserIds', 'in', ['me']),
    });

    expect(mentioning.conversations.map((conversation) => conversation.id)).toEqual([second]);

    // Answering reads it, so it leaves every count.
    await teammate.conversations.messages.create({ conversationId: first ?? '', content: 'On it' });

    expect(await teammate.conversations.counts({})).toMatchObject({
      unread: 1,
      assignedToMe: 0,
      awaitingResponse: 1,
      channels: [expect.objectContaining({ unread: 1 })],
    });
    expect(await clientAs('org-ib-counts-other').conversations.counts({})).toMatchObject({
      unread: 0,
      channels: [],
    });
  });
});
