import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import type * as CoreModule from '#/core.ts';
import { PERMISSIONS } from '#/core.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';

// Tests never reach core: each visitor becomes a customer of this stand-in, a search finds the
// customers a test sets, and notifications go nowhere.
const created = vi.hoisted(() => ({ customers: 0, searches: new Map<string, string[]>() }));

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
          list: async ({ search }: { search: string }) => ({
            data: (created.searches.get(search) ?? []).map((id) => ({ id })),
          }),
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

/** An owner, a channel with `teammate` in it and its messenger, and a visitor who wrote `contents`. */
const setUp = async (orgId: string, contents: string[]) => {
  const owner = clientAs(orgId);
  const teammate = clientAs(orgId, [PERMISSIONS.inboxView, PERMISSIONS.channelView], 'teammate');
  const channel = await owner.channels.create({ name: 'Support', memberIds: ['teammate'] });

  const integration = await owner.integrations.create({
    channelId: channel.id,
    kind: 'messenger',
    name: 'Website',
    config: {},
  });

  const { token } = Connected.parse((await post('/connect', { key: integration.publicKey })).body);

  for (const content of contents) await post('/messages', { content }, token);

  // Newest first.
  const ids = (await teammate.conversations.list({})).conversations.map((row) => row.id);

  return { owner, teammate, channel, ids };
};

describe('inbox list', () => {
  it('counts what waits unread in each sidebar queue and channel', async () => {
    const { owner, teammate, channel, ids } = await setUp('org-ib-counts', ['First', 'Second']);
    const [second = '', first = ''] = ids;

    expect(await teammate.conversations.counts({})).toEqual({
      unread: 2,
      assignedToMe: 0,
      mentioned: 0,
      unassigned: 2,
      awaitingResponse: 2,
      channels: [{ id: channel.id, name: 'Support', icon: null, unread: 2 }],
    });

    // Assigned to them, and mentioned in another's note: each queue counts its own.
    await owner.conversations.assign({ ids: [first], assigneeId: 'teammate' });
    await owner.conversations.messages.create({
      conversationId: second,
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
    await teammate.conversations.messages.create({ conversationId: first, content: 'On it' });

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

  it('tags conversations together and filters by tag', async () => {
    const { owner, teammate, ids } = await setUp('org-ib-tags', ['Invoice', 'Refund']);
    const [id = ''] = ids;
    const billing = await owner.tags.create({ type: 'conversation', name: 'Billing' });

    await expect(
      owner.tags.create({ type: 'conversation', name: 'billing' }),
    ).rejects.toMatchObject({ code: 'TAG_NAME_TAKEN' });
    await expect(teammate.tags.create({ type: 'conversation', name: 'VIP' })).rejects.toMatchObject(
      { code: 'FORBIDDEN' },
    );

    expect(await teammate.conversations.setTags({ ids, tagIds: [billing.id] })).toMatchObject([
      { tagIds: [billing.id] },
      { tagIds: [billing.id] },
    ]);
    expect(
      (await teammate.conversations.list({ filter: rule('tagIds', 'in', [billing.id]) }))
        .totalCount,
    ).toBe(2);

    // One conversation the member can't see fails the whole change.
    await expect(
      teammate.conversations.setTags({ ids: [id, 'unseen'], tagIds: [] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await teammate.conversations.get({ id })).toMatchObject({ tagIds: [billing.id] });

    // A member who only works the inbox reads the tags they set, and still not the channels.
    const agent = clientAs('org-ib-tags', [PERMISSIONS.inboxView], 'agent');

    expect((await agent.tags.list({ type: 'conversation' })).data).toMatchObject([
      { id: billing.id, name: 'Billing' },
    ]);
    await expect(agent.channels.list({})).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await owner.tags.remove({ ids: [billing.id] });
    expect(await teammate.conversations.get({ id })).toMatchObject({ tagIds: [] });
  });

  it('searches the last message and the customer core finds by name, email or phone', async () => {
    const { teammate, ids } = await setUp('org-ib-search', ['Where is my parcel']);
    const [conversation] = (await teammate.conversations.list({})).conversations;

    created.searches.set('ada@e2e.test', [conversation?.customerId ?? '']);

    const found = async (search: string) =>
      (await teammate.conversations.list({ search })).conversations.map((row) => row.id);

    expect(await found('parcel')).toEqual(ids);
    expect(await found('ada@e2e.test')).toEqual(ids);
    expect(await found('nobody')).toEqual([]);
  });
});
