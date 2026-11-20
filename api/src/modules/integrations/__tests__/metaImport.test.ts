import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { JOBS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { customerLinks, integrations } from '#/db/inbox.ts';
import { metaAccounts, metaApps, metaBots } from '#/db/meta.ts';
import { clientAs } from '#/test/member.ts';
import { sealSecret } from '../secrets.ts';
import { asked, connectMeta, metaConnectionsOf } from './standIns.ts';
import { runJob } from './fakes.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

const orgId = 'org-meta-import';

const integrationOf = async (kind: string, accountId: string) => {
  const owner = clientAs(orgId);
  const channel = await owner.channels.create({ name: `${kind} ${accountId}` });

  const integration = await owner.integrations.create({
    channelId: channel.id,
    kind,
    name: kind,
    config: { connectionId: `before-${accountId}` },
  });

  await withOrg(orgId, (tx) =>
    tx
      .update(integrations)
      .set({ config: { accountId } })
      .where(eq(integrations.id, integration.id)),
  );

  return integration.id;
};

const seedOldMeta = async () => {
  const integrationIds = {
    page: await integrationOf('facebook', 'account-page-1'),
    instagram: await integrationOf('instagram', 'account-ig-1'),
    known: await integrationOf('facebook', 'account-page-2'),
  };

  await withOrg(orgId, async (tx) => {
    await tx.insert(metaApps).values({
      orgId,
      appId: '1234567890',
      secret: sealSecret(orgId, { appSecret: 'own-app-secret' }),
      verifyToken: 'own-verify-token',
      createdBy: 'owner',
    });
    await tx.insert(metaAccounts).values([
      {
        id: 'account-page-1',
        orgId,
        kind: 'facebook',
        externalId: 'page-1',
        name: 'Shop',
        secret: sealSecret(orgId, { pageToken: 'page-token-1' }),
        status: 'healthy',
        createdBy: 'owner',
      },
      {
        id: 'account-ig-1',
        orgId,
        kind: 'instagram',
        externalId: 'ig-1',
        name: '@shop.mn',
        config: { pageId: 'page-1', username: 'shop.mn' },
        secret: sealSecret(orgId, { pageToken: 'page-token-1' }),
        status: 'broken',
        error: 'Error validating access token',
        createdBy: 'owner',
      },
      {
        id: 'account-page-2',
        orgId,
        kind: 'facebook',
        externalId: 'page-2',
        name: 'Outlet',
        secret: sealSecret(orgId, { pageToken: 'page-token-2' }),
        status: 'healthy',
        createdBy: 'owner',
      },
    ]);
    await tx.insert(customerLinks).values([
      { orgId, source: 'facebook', externalId: 'psid-1', customerId: 'customer-bat' },
      { orgId, source: 'instagram', externalId: 'igsid-6', customerId: 'customer-saraa' },
      { orgId, source: 'telegram', externalId: '4242', customerId: 'customer-dorj' },
    ]);
    await tx.insert(metaBots).values({
      orgId,
      connectionId: 'account-page-1',
      name: 'Shop bot',
      createdBy: 'owner',
    });
  });

  return integrationIds;
};

const importJob = { orgId, name: JOBS.metaImport.name, payload: {} };

describe('meta import', () => {
  it('hands the app, pages and people to core once, and points integrations and bots at core’s connections', async () => {
    const known = connectMeta(orgId, 'facebook', { externalId: 'page-2', name: 'Outlet' });
    const ids = await seedOldMeta();

    await runJob(importJob);

    const [app, connections, people] = asked.metaImported;

    expect(asked.metaImported).toHaveLength(3);
    expect(app).toEqual({
      app: { appId: '1234567890', appSecret: 'own-app-secret', verifyToken: 'own-verify-token' },
    });
    expect(people?.people?.toSorted((a, b) => a.externalId.localeCompare(b.externalId))).toEqual([
      { kind: 'instagram', externalId: 'igsid-6', customerId: 'customer-saraa' },
      { kind: 'facebook', externalId: 'psid-1', customerId: 'customer-bat' },
    ]);
    expect(connections).toEqual({
      connections: [
        {
          kind: 'facebook',
          externalId: 'page-1',
          pageId: 'page-1',
          name: 'Shop',
          username: null,
          pageToken: 'page-token-1',
          app: 'own',
          status: 'healthy',
          statusReason: null,
          connectedBy: 'owner',
        },
        {
          kind: 'instagram',
          externalId: 'ig-1',
          pageId: 'page-1',
          name: '@shop.mn',
          username: 'shop.mn',
          pageToken: 'page-token-1',
          app: 'own',
          status: 'broken',
          statusReason: 'Error validating access token',
          connectedBy: 'owner',
        },
      ],
    });

    const connectionOf = (kind: string, externalId: string) =>
      metaConnectionsOf(orgId).find((one) => one.kind === kind && one.externalId === externalId)
        ?.id;

    const owner = clientAs(orgId);

    const configs = Object.fromEntries(
      (await owner.integrations.list({})).map((integration) => [
        integration.id,
        integration.config,
      ]),
    );

    expect(configs).toEqual({
      [ids.page]: { connectionId: connectionOf('facebook', 'page-1') },
      [ids.instagram]: { connectionId: connectionOf('instagram', 'ig-1') },
      [ids.known]: { connectionId: known.id },
    });
    expect((await owner.integrations.meta.bots.list()).bots).toMatchObject([
      {
        name: 'Shop bot',
        connectionId: connectionOf('facebook', 'page-1'),
        connectionName: 'Shop',
      },
    ]);

    const handed = asked.metaImported.length;

    await runJob(importJob);

    expect(asked.metaImported).toHaveLength(handed);
  });
});
