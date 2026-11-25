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

/** A path of the Graph API, without its version. */
const graphPath = (call: ProviderCall) => call.url.pathname.replace('/v23.0/', '');

/**
 * Meta for someone who reaches page-2 and page-3 through a Business portfolio: `me/accounts`
 * lists only page-1, the login granted all three, and Meta won't subscribe page-3.
 */
const portfolio = (call: ProviderCall) => {
  const path = graphPath(call);

  if (path === 'debug_token')
    return {
      data: {
        granular_scopes: [
          { scope: 'pages_show_list', target_ids: ['page-1', 'page-2', 'page-3'] },
          { scope: 'pages_messaging', target_ids: ['page-1', 'page-2', 'page-3'] },
        ],
      },
    };

  if (path === 'page-2' || path === 'page-3')
    return {
      id: path,
      name: path === 'page-2' ? 'Resort' : 'Closed shop',
      access_token: `${path}-token`,
    };

  if (path === 'page-3/subscribed_apps' && call.method === 'POST')
    return Response.json(
      { error: { message: 'Requires pages_manage_metadata permission' } },
      { status: 400 },
    );

  if (path === 'page-2/subscribed_apps' || path === 'page-3/subscribed_apps')
    return call.method === 'GET' ? { data: [] } : { success: true };

  return withRelay(call);
};

describe('the pages a Facebook connection connects', () => {
  it('connects the pages the login granted that Meta leaves out of its list, and names the one it refuses', async () => {
    const calls = fakeProviders(portfolio);

    const { accounts, refused } = await clientAs('org-pages-portfolio').integrations.meta.connect({
      connectionId: 'fb-conn',
    });

    expect(accounts.map((account) => account.externalId).toSorted()).toEqual([
      'ig-1',
      'page-1',
      'page-2',
    ]);
    expect(refused).toEqual([
      {
        pageId: 'page-3',
        name: 'Closed shop',
        reason: 'Meta refused: Requires pages_manage_metadata permission',
      },
    ]);

    // Meta is asked which pages the login granted with the connection's own app.
    const debugged = calls.find((call) => graphPath(call) === 'debug_token');

    expect(debugged?.authorization).toBe('Bearer test-meta-app|test-meta-app-secret');
    expect(debugged?.url.searchParams.get('input_token')).toBe('long-user-token');
    expect(relayed(calls)).toEqual([
      'PUT /v1/routes/facebook/page-1',
      'PUT /v1/routes/facebook/page-2',
      'PUT /v1/routes/instagram/ig-1',
    ]);
  });

  it('fails with what Meta said when no page connects', async () => {
    fakeProviders((call) =>
      graphPath(call) === 'me/accounts'
        ? { data: [] }
        : graphPath(call) === 'page-1'
          ? Response.json({ error: { message: 'Unsupported get request' } }, { status: 400 })
          : graphPath(call) === 'debug_token'
            ? { data: { granular_scopes: [{ scope: 'pages_show_list', target_ids: ['page-1'] }] } }
            : withRelay(call),
    );

    await expect(
      clientAs('org-pages-refused').integrations.meta.connect({ connectionId: 'fb-conn' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'page-1: Meta refused: Unsupported get request',
    });
  });

  it('says how to give erxes a page when the login granted none', async () => {
    fakeProviders((call) =>
      graphPath(call) === 'me/accounts'
        ? { data: [] }
        : graphPath(call) === 'debug_token'
          ? { data: { granular_scopes: [{ scope: 'pages_show_list' }] } }
          : withRelay(call),
    );

    await expect(
      clientAs('org-pages-none').integrations.meta.connect({ connectionId: 'fb-conn' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message:
        "Facebook gave erxes no pages: sign in again and tick your pages in Facebook's step that asks which pages erxes may use",
    });
  });
});
