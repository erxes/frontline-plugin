import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import type * as CoreModule from '#/core.ts';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { insertIntegration } from '#/modules/inbox/insertIntegration.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';
import { fakeCoreSessions } from '#/test/session.ts';

vi.mock('#/core.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();

  return {
    ...actual,
    core: {
      ...actual.core,
      forOrg: () => ({
        saas: {
          pluginPlan: async () => ({
            saas: true,
            tier: 'pro',
            status: null,
            access: 'full',
            readOnlyUntil: null,
          }),
        },
      }),
    },
  };
});

const { get, url } = serve('/api/automations');

let tokens: Awaited<ReturnType<typeof fakeCoreSessions>>;

const connect = async (orgId: string, kind: string, name: string, channelId: string) =>
  withOrg(orgId, (tx) =>
    insertIntegration(tx, { orgId, userId: 'owner' }, { channelId, kind, name, config: {} }),
  );

beforeAll(async () => {
  tokens = await fakeCoreSessions();
});

describe("automation pickers for a trigger's connection", () => {
  it("lists the organisation's pages, bots and mailboxes by kind", async () => {
    const owner = clientAs('org-ar-a');
    const support = await owner.channels.create({ name: 'Support', memberIds: [] });
    const sales = await owner.channels.create({ name: 'Sales', memberIds: [] });

    const page = await connect('org-ar-a', 'facebook', 'Acme Page', support.id);
    const pageInSales = await connect('org-ar-a', 'facebook', 'Acme Page', sales.id);
    const bot = await connect('org-ar-a', 'telegram', 'Acme Bot', support.id);

    const member = await tokens.session('org-ar-a', 'teammate', [PERMISSIONS.channelView]);

    expect(await get('/records/facebook_page', member)).toEqual({
      status: 200,
      body: [
        { value: pageInSales.id, label: 'Acme Page · Sales' },
        { value: page.id, label: 'Acme Page · Support' },
      ],
    });
    expect(await get('/records/telegram_bot', member)).toEqual({
      status: 200,
      body: [{ value: bot.id, label: 'Acme Bot · Support' }],
    });
    expect((await get('/records/integration', member)).body).toHaveLength(3);
    expect((await get('/records/unknown', member)).status).toBe(404);

    const outsider = await tokens.session('org-ar-b', 'someone', [PERMISSIONS.channelView]);

    expect(await get('/records/facebook_page', outsider)).toEqual({ status: 200, body: [] });

    const noAccess = await tokens.session('org-ar-a', 'guest', []);

    expect((await get('/records/facebook_page', noAccess)).status).toBe(403);
  });

  it("answers web's builder from the organisation's own address", async () => {
    const preflight = await fetch(url('/records/facebook_page'), {
      method: 'OPTIONS',
      headers: {
        origin: 'https://acme.os.erxes.io',
        'access-control-request-method': 'GET',
        'access-control-request-headers': 'authorization',
      },
    });

    expect(preflight.headers.get('access-control-allow-origin')).toBe('https://acme.os.erxes.io');
  });
});
