import { describe, expect, it, vi } from 'vite-plus/test';
import { INTEGRATION_BROKEN, JOBS, PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';
import {
  channelFor,
  fakeProviders,
  fixture,
  runJob,
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

const { deliver } = serve();

describe('integration accounts', () => {
  it('shows accounts to their organisation and members allowed to see them', async () => {
    fakeProviders(telegramApi);

    await clientAs('org-acc-a').integrations.telegram.connect({ token: '777:good-token-abc' });

    const viewer = clientAs('org-acc-a', [PERMISSIONS.integrationView]);

    expect((await viewer.integrations.accounts.list({})).accounts).toHaveLength(1);
    expect((await clientAs('org-acc-b').integrations.accounts.list({})).accounts).toEqual([]);
    await expect(clientAs('org-acc-a', []).integrations.accounts.list({})).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(
      viewer.integrations.telegram.connect({ token: '777:good-token-abc' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('marks an account broken when the provider stops taking it, and tells who connected it', async () => {
    let revoked = false;

    const calls = fakeProviders(() =>
      revoked
        ? Response.json({ message: '401: Unauthorized', code: 0 }, { status: 401 })
        : { id: 'bot-9', username: 'shop-bot' },
    );

    const owner = clientAs('org-acc-c');
    const account = await owner.integrations.discord.connect({ token: 'good-token-abcdefghijklm' });

    expect(account).toMatchObject({ provider: 'discord', status: 'healthy', name: 'shop-bot' });
    expect(calls.at(-1)?.url.href).toBe('https://discord.com/api/v10/users/%40me');
    expect(calls.at(-1)?.authorization).toBe('Bot good-token-abcdefghijklm');

    revoked = true;

    const check = { orgId: 'org-acc-c', name: JOBS.check.name, payload: {} };

    await runJob(check);
    await runJob(check);

    expect((await owner.integrations.accounts.list({})).accounts).toMatchObject([
      { status: 'broken', error: '401: Unauthorized' },
    ]);
    // Told once, when it broke, not on every check after.
    expect(asked.notifications).toMatchObject([
      { kind: INTEGRATION_BROKEN, userIds: ['user-org-acc-c'], body: '401: Unauthorized' },
    ]);
  });

  it('removes an account, so its webhook stops leading anywhere', async () => {
    const calls = fakeProviders(telegramApi);
    const owner = clientAs('org-acc-d');
    const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });
    const { path, signed } = webhookOf(calls);

    await channelFor('org-acc-d', 'telegram', account.id);
    await expect(
      clientAs('org-acc-e').integrations.accounts.remove({ ids: [account.id] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await owner.integrations.accounts.remove({ ids: [account.id] });

    expect(calls.at(-1)?.url.pathname).toBe('/bot777:good-token-abc/deleteWebhook');
    expect((await owner.integrations.accounts.list({})).accounts).toEqual([]);
    expect(await deliver(path, fixture('telegram-update.json'), signed)).toBe(200);
    expect((await owner.conversations.list({})).totalCount).toBe(0);
  });
});
