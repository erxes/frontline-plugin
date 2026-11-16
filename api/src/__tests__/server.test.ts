import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { config } from '#/config.ts';
import { createApp } from '#/server.ts';

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;

beforeAll(async () => {
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

  it.each(['/api/rpc', '/api/v1', '/api/openapi.json', '/ui'])(
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

  it('keeps the help center response CORS origin', async () => {
    const response = await fetch(`${base}/api/public/custom-domains/resolve`, {
      headers: { origin: config.coreUiOrigin },
    });

    expect(response.status).toBe(404);
    expect(response.headers.get('access-control-allow-origin')).toBe(config.coreUiOrigin);
  });
});
