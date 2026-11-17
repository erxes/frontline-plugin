import { randomUUID } from 'node:crypto';
import { PLUGIN_SESSION_SCHEME } from '@erxes/core-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { config } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import { createApp } from '#/server.ts';
import { fakeCoreSessions } from '#/test/session.ts';

/** The parts of the OpenAPI document these tests read. */
const OpenApiDoc = z.object({
  servers: z.array(z.object({ url: z.string() })),
  paths: z.record(z.string(), z.unknown()),
  security: z.array(z.record(z.string(), z.array(z.string()))),
});

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let sessionToken: Awaited<ReturnType<typeof fakeCoreSessions>>;

beforeAll(async () => {
  sessionToken = await fakeCoreSessions();

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
    const token = await sessionToken(`org-${randomUUID()}`, 'user-1', [PERMISSIONS.channelView]);

    expect((await fetch(url, { method: 'POST' })).status).toBe(401);

    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ channels: [] });
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
