import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { serve } from '#/test/http.ts';
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
});
