import { randomUUID } from 'node:crypto';
import { PLUGIN_SESSION_SCHEME } from '@erxes/core-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { config } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import { createApp } from '#/server.ts';
import { clientAs } from '#/test/member.ts';
import { fakeCoreSessions } from '#/test/session.ts';

/** The parts of the OpenAPI document these tests read. */
const OpenApiDoc = z.object({
  servers: z.array(z.object({ url: z.string() })),
  paths: z.record(z.string(), z.unknown()),
  security: z.array(z.record(z.string(), z.array(z.string()))),
});

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let core: Awaited<ReturnType<typeof fakeCoreSessions>>;

beforeAll(async () => {
  core = await fakeCoreSessions();

  await new Promise<void>((resolve) => {
    server = createApp().listen(0, () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === 'string') throw new Error('not listening on a port');

  base = `http://127.0.0.1:${address.port}`;
});

afterAll(() => {
  server.close();
});

describe('server', () => {
  it('answers health checks', async () => {
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it('refuses procedures without a valid session token', async () => {
    const url = `${base}/api/rpc/channels/list`;

    expect((await fetch(url, { method: 'POST' })).status).toBe(401);
    expect(
      (await fetch(url, { method: 'POST', headers: { authorization: 'Bearer forged' } })).status,
    ).toBe(401);
  });

  it('documents its procedures for members, readable from any origin', async () => {
    const response = await fetch(`${base}/api/openapi/member.json`, {
      headers: { origin: 'https://acme.example.com' },
    });

    const doc = OpenApiDoc.parse(await response.json());

    expect(response.headers.get('access-control-allow-origin')).toBe('https://acme.example.com');
    expect(doc.servers).toEqual([{ url: `${config.publicUrl}/api` }]);
    expect(doc.security).toEqual([{ [PLUGIN_SESSION_SCHEME]: [] }]);
    expect(Object.keys(doc.paths)).toContain('/v1/channels/list');
  });

  it('serves the procedures as REST to a member with a session token', async () => {
    const url = `${base}/api/v1/channels/list`;
    const token = await core.session(`org-${randomUUID()}`, 'user-1', [PERMISSIONS.channelView]);

    expect((await fetch(url, { method: 'POST' })).status).toBe(401);

    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ channels: [] });
  });

  it('imports and exports tickets for core, once per request', async () => {
    const orgId = `org-${randomUUID()}`;
    const owner = clientAs(orgId);
    const channel = await owner.channels.create({ name: 'Support', memberIds: ['user-1'] });
    const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Main' });

    /** Core's request, signed over `signed` (the body unless a test forges one). */
    const post = async (
      kind: string,
      request: Record<string, unknown>,
      requestId = randomUUID(),
      signed?: string,
    ) => {
      const body = JSON.stringify({
        requestId,
        orgId,
        userId: 'user-1',
        type: 'frontline:ticket',
        kind,
        ...request,
      });

      const token = await core.transfer(signed ?? body, { requestId, orgId });

      return fetch(`${base}/api/transfer/${kind}`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body,
      });
    };

    const batch = {
      importId: randomUUID(),
      mode: 'create',
      rows: [
        { rowNumber: 2, values: { name: 'Refund', pipeline: 'Main', priority: 'High' } },
        { rowNumber: 3, values: { name: 'Late', pipeline: 'Nowhere' } },
      ],
    };

    const check = await post('import', { ...batch, dryRun: true });

    expect(await check.json()).toMatchObject({
      rows: [
        { rowNumber: 2, action: 'create' },
        { rowNumber: 3, action: 'error', error: 'No pipeline Nowhere' },
      ],
    });
    expect((await owner.tickets.list({ pipelineId: pipeline.id })).tickets).toEqual([]);

    const requestId = randomUUID();
    const once = async () => (await post('import', { ...batch, dryRun: false }, requestId)).json();
    const first: unknown = await once();

    expect(await once()).toEqual(first);
    expect((await owner.tickets.list({ pipelineId: pipeline.id })).tickets).toMatchObject([
      { name: 'Refund', priority: 3 },
    ]);

    const page = await post('export', {
      columns: ['name', 'pipeline', 'priority', 'channel'],
      query: {},
      cursor: null,
      limit: 10,
    });

    expect(await page.json()).toEqual({
      cursor: null,
      rows: [{ name: 'Refund', pipeline: 'Main', priority: 'High', channel: 'Support' }],
    });

    const forged = await post('import', { ...batch, dryRun: false }, randomUUID(), '{}');

    expect(forged.status).toBe(401);
  });

  it.each(['/api/rpc', '/api/v1', '/ui'])(
    'allows a workspace origin to preflight %s',
    async (path) => {
      const origin = 'https://acme.os.erxes.io';

      const response = await fetch(`${base}${path}`, {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization,content-type',
        },
      });

      expect(response.status).toBe(204);
      expect(response.headers.get('access-control-allow-origin')).toBe(origin);
      expect(response.headers.get('access-control-allow-headers')).toContain('authorization');
      expect(response.headers.get('access-control-allow-credentials')).toBeNull();
      expect(response.headers.get('access-control-max-age')).toBe('600');
    },
  );

  it('lets web and the websites a knowledge base is embedded in read the help center routes', async () => {
    const response = await fetch(`${base}/api/public/custom-domains/resolve`, {
      headers: { origin: config.coreUiOrigin },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });
});
