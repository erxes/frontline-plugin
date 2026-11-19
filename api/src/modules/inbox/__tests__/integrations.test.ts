import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import { serve } from '#/test/http.ts';
import { only } from '#/test/filter.ts';
import { clientAs } from '#/test/member.ts';

// Tests never reach core: the customer a visitor becomes comes from this stand-in.
vi.mock('#/core.ts', async (importOriginal) =>
  (await import('#/modules/integrations/__tests__/standIns.ts')).coreStandIn(
    await importOriginal(),
  ),
);

const { post } = serve('/api/public/messenger');

const Connected = z.looseObject({ token: z.string() });

/** An organisation's owner, a channel with `teammate` in it, its messenger and a visitor's token. */
const setUp = async (orgId: string) => {
  const owner = clientAs(orgId);
  const channel = await owner.channels.create({ name: 'Support', memberIds: ['teammate'] });

  const integration = await owner.integrations.create({
    channelId: channel.id,
    kind: 'messenger',
    name: 'Website',
  });

  const connected = await post('/connect', { key: integration.publicKey });

  return {
    owner,
    teammate: clientAs(orgId, [PERMISSIONS.inboxView, PERMISSIONS.channelView], 'teammate'),
    channel,
    integration,
    token: Connected.parse(connected.body).token,
  };
};

describe('integrations', () => {
  it('checks a messenger’s settings and lets only channel admins connect one', async () => {
    const { channel, teammate, owner, integration } = await setUp('org-in-a');

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

    const kinds = async () =>
      (await owner.conversations.counts({})).channels.find(({ id }) => id === channel.id)?.kinds;

    expect(await kinds()).toEqual([{ kind: 'messenger', unread: 0 }]);

    // An archived messenger takes no visitors and leaves the sidebar.
    await owner.integrations.update({ id: integration.id, isActive: false });
    expect((await post('/connect', { key: integration.publicKey })).status).toBe(404);
    expect(await kinds()).toEqual([]);

    await owner.integrations.remove({ id: integration.id });
    expect(await owner.integrations.list({})).toEqual([]);
  });

  it('moves an integration with its conversations to another channel an admin picks', async () => {
    const { owner, teammate, integration, token } = await setUp('org-in-b');

    await post('/messages', { content: 'Where is my parcel?' }, token);

    const sales = await owner.channels.create({ name: 'Sales' });

    await expect(
      teammate.integrations.update({ id: integration.id, channelId: sales.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      owner.integrations.update({ id: integration.id, channelId: 'no-such-channel' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(
      owner.integrations.update({ id: integration.id, channelId: sales.id }),
    ).resolves.toMatchObject({ channelId: sales.id });

    expect((await owner.conversations.list({})).conversations).toEqual([
      expect.objectContaining({ integrationId: integration.id, channelName: 'Sales' }),
    ]);
    // The teammate worked the old channel only, so the conversation left their inbox with it.
    expect((await teammate.conversations.list({})).totalCount).toBe(0);
  });

  it('reports a Facebook page’s conversations, who wrote in them, and its comments and the posts they were on', async () => {
    const orgId = 'org-in-c';
    const { owner, teammate, channel } = await setUp(orgId);
    const sales = await owner.channels.create({ name: 'Sales' });
    const start = new Date('2026-03-01T01:00:00Z');
    const later = (hours: number) => new Date(start.getTime() + hours * 3_600_000);

    await withOrg(orgId, async (tx) => {
      const pages = await tx
        .insert(integrations)
        .values(
          [channel.id, sales.id].map((channelId) => ({
            orgId,
            channelId,
            kind: 'facebook',
            name: 'Page',
            createdBy: 'owner',
          })),
        )
        .returning({ id: integrations.id, channelId: integrations.channelId });

      const opened = await tx
        .insert(conversations)
        .values(
          // A conversation with no external id is a direct one, not a comment thread.
          [null, 'comment:post-1:person-1', 'comment:post-1:person-2', 'm_2'].map(
            (externalId, i) => ({
              orgId,
              externalId,
              integrationId: pages[i === 3 ? 1 : 0]?.id ?? '',
              channelId: pages[i === 3 ? 1 : 0]?.channelId ?? '',
              customerId: 'customer-1',
              createdAt: start,
            }),
          ),
        )
        .returning({ id: conversations.id });

      const [chat, thread, otherThread] = opened.map(({ id }) => id);

      await tx.insert(messages).values([
        { orgId, conversationId: chat ?? '', customerId: 'customer-1', createdAt: start },
        { orgId, conversationId: chat ?? '', createdAt: later(0.1) },
        { orgId, conversationId: chat ?? '', userId: 'teammate', createdAt: later(24) },
        { orgId, conversationId: chat ?? '', userId: 'teammate', internal: true, createdAt: start },
        { orgId, conversationId: thread ?? '', customerId: 'customer-1', createdAt: start },
        { orgId, conversationId: otherThread ?? '', userId: 'teammate', createdAt: start },
      ]);
    });

    // 1 to 3 March in Ulaanbaatar; the teammate sees only the Support channel's page.
    const period = { from: later(-9), to: later(63), timeZone: 'Asia/Ulaanbaatar' };

    const report = await teammate.reports.meta(period);

    expect({
      ...report,
      topPosts: report.topPosts.map(({ conversationId: _, ...row }) => row),
    }).toEqual({
      conversations: 1,
      botConversations: 1,
      incoming: 1,
      staff: 1,
      bot: 1,
      comments: 2,
      posts: 1,
      topPosts: [
        { postId: 'post-1', comments: 1, replies: 1, commenters: 1, lastActivityAt: start },
      ],
      days: [
        { day: '2026-03-01', conversations: 1, messages: 2, comments: 2 },
        { day: '2026-03-02', conversations: 0, messages: 1, comments: 0 },
        { day: '2026-03-03', conversations: 0, messages: 0, comments: 0 },
      ],
    });
    await expect(owner.reports.meta(period)).resolves.toMatchObject({ conversations: 2 });

    // A card that counts one channel: Sales holds one direct conversation, Support the rest.
    await expect(
      owner.reports.meta({ ...period, filter: only('subject.channelId', sales.id) }),
    ).resolves.toMatchObject({
      conversations: 1,
      comments: 0,
    });
    await expect(
      owner.reports.conversations({ ...period, filter: only('subject.channelId', channel.id) }),
    ).resolves.toMatchObject({ started: 3 });
    await expect(
      owner.reports.calls({ ...period, filter: only('subject.channelId', sales.id) }),
    ).resolves.toMatchObject({
      total: 0,
    });

    // Naming a channel the teammate isn't in shows them nothing of it.
    await expect(
      teammate.reports.conversations({ ...period, filter: only('subject.channelId', sales.id) }),
    ).resolves.toMatchObject({ started: 0, unresolved: 0 });
    await expect(
      teammate.reports.meta({ ...period, filter: only('subject.channelId', sales.id) }),
    ).resolves.toMatchObject({
      conversations: 0,
      incoming: 0,
    });
  });
});
