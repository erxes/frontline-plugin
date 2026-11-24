import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { JOBS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { serve as serveApi } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';
import {
  channelFor,
  fakeProviders,
  fixture,
  graphApi,
  type ProviderCall,
  runJob,
  serve,
  signedByMeta,
} from './fakes.ts';
import { asked } from './standIns.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

const { deliver } = serve();
const api = serveApi('/api');

/** Core's `core.integration.changed` for `connectionId`, delivered to `/api/events`. */
const changed = async (orgId: string, connectionId: string, change: string, key = 'facebook') => {
  const at = new Date().toISOString();
  const id = `event-${connectionId}-${change}-${at}`;
  const type = 'core.integration.changed';

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
          subjectType: null,
          subjectId: null,
          entityType: 'integration_connection',
          entityId: connectionId,
          actorType: 'user',
          actorId: 'admin',
          payload: { key, connectionId, change },
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

/** The Graph API, and meta-relay taking every call. */
const withRelay = (call: ProviderCall) =>
  call.url.hostname === 'relay.example' ? new Response(null) : graphApi(call);

/** The calls to meta-relay, as `METHOD path`. */
const relayed = (calls: ProviderCall[]) =>
  calls
    .filter((call) => call.url.hostname === 'relay.example')
    .map((call) => `${call.method} ${call.url.pathname}`)
    .toSorted();

const REMOVED =
  "Its Facebook connection in erxes was removed: connect it again through erxes's Facebook connection";

const reads = (connectionId: string) => asked.credentials.filter((id) => id === connectionId);

describe("the organisation's Facebook connection", () => {
  it("checks the deliveries of pages connected through the organisation's own app with its secret", async () => {
    const calls = fakeProviders(withRelay);
    const owner = clientAs('org-conn-own');

    await owner.integrations.meta.connect({ connectionId: 'fb-own' });

    // The relay forwards only the install's app, and the page had no fields of the own app.
    expect(relayed(calls)).toEqual([]);

    const subscribed = calls.find(
      (call) => call.method === 'POST' && call.url.pathname.endsWith('page-1/subscribed_apps'),
    );

    expect(subscribed?.authorization).toBe('Bearer own-page-token-1');
    expect(subscribed?.url.searchParams.get('subscribed_fields')?.split(',')).not.toContain(
      'leadgen',
    );

    const { accounts } = await owner.integrations.accounts.list({ provider: 'facebook' });

    await channelFor('org-conn-own', 'facebook', accounts[0]?.id ?? '');

    const raw = fixture('meta-delivery.json');

    expect(await deliver('/meta', raw, signedByMeta(raw, 'a-stranger-app-secret'))).toBe(401);
    expect(await deliver('/meta', raw, signedByMeta(raw, 'own-app-secret-0123456789'))).toBe(200);
    expect(await deliver('/meta', raw, signedByMeta(raw))).toBe(200);
    expect((await owner.conversations.list({})).totalCount).toBe(1);

    // Core is asked for the connection's app once; a change makes the next delivery ask again.
    expect(reads('fb-own')).toHaveLength(1);
    expect(await changed('org-conn-own', 'fb-own', 'active')).toBe(204);
    expect(await deliver('/meta', raw, signedByMeta(raw, 'own-app-secret-0123456789'))).toBe(200);
    expect(reads('fb-own')).toHaveLength(2);
  });

  it("tells core's Facebook tile that pages on frontline's old login need attention", async () => {
    fakeProviders(withRelay);

    const orgId = 'org-old-login';
    const owner = clientAs(orgId);
    const check = { orgId, name: JOBS.check.name, payload: {} };

    const metaReports = () =>
      asked.reports
        .filter(([org, key]) => org === orgId && key === 'meta')
        .map(([, , state]) => state);

    await owner.integrations.meta.connect({ connectionId: 'fb-conn' });
    await runJob(check);

    expect(metaReports().at(-1)).toBe('connected');

    // A page connected before core's connection existed has none.
    await withOrg(orgId, (tx) =>
      tx
        .update(integrationAccounts)
        .set({ connectionId: null })
        .where(eq(integrationAccounts.provider, 'facebook')),
    );
    await runJob(check);

    expect(metaReports().at(-1)).toBe('attention');

    // Connecting it again through core's connection settles it.
    await owner.integrations.meta.connect({ connectionId: 'fb-conn' });
    await runJob(check);

    expect(metaReports().at(-1)).toBe('connected');
  });

  it('stops the pages of a connection core removed, until a member connects them again', async () => {
    const calls = fakeProviders(withRelay);
    const owner = clientAs('org-conn-gone');

    await owner.integrations.meta.connect({ connectionId: 'fb-conn' });

    const { accounts } = await owner.integrations.accounts.list({ provider: 'facebook' });
    const page = accounts[0]?.id ?? '';

    await channelFor('org-conn-gone', 'facebook', page);

    // Another integration's connection, or one turned on, changes nothing.
    expect(await changed('org-conn-gone', 'fb-conn', 'removed', 'slack')).toBe(204);
    expect(await changed('org-conn-gone', 'fb-conn', 'active')).toBe(204);
    expect((await owner.integrations.accounts.list({})).accounts).toMatchObject([
      { status: 'healthy' },
      { status: 'healthy' },
    ]);

    calls.length = 0;
    expect(await changed('org-conn-gone', 'fb-conn', 'removed')).toBe(204);

    const stopped = (await owner.integrations.accounts.list({})).accounts;

    expect(stopped.map(({ status, error }) => [status, error])).toEqual([
      ['broken', REMOVED],
      ['broken', REMOVED],
    ]);
    expect(relayed(calls)).toEqual([
      'DELETE /v1/routes/facebook/page-1',
      'DELETE /v1/routes/instagram/ig-1',
    ]);

    // Its deliveries lead nowhere, and a repair asks for a new connect.
    const raw = fixture('meta-delivery.json');

    expect(await deliver('/meta', raw, signedByMeta(raw))).toBe(200);
    expect((await owner.conversations.list({})).totalCount).toBe(0);
    await expect(owner.integrations.accounts.repair({ id: page })).resolves.toMatchObject({
      status: 'broken',
      error: "Its Facebook connection went: connect it again through erxes's Facebook connection",
    });

    await owner.integrations.meta.connect({ connectionId: 'fb-conn' });

    expect((await owner.integrations.accounts.list({})).accounts).toMatchObject([
      { status: 'healthy', connectionId: 'fb-conn' },
      { status: 'healthy', connectionId: 'fb-conn' },
    ]);
    expect(await deliver('/meta', raw, signedByMeta(raw))).toBe(200);
    expect((await owner.conversations.list({})).totalCount).toBe(1);
  });
});
