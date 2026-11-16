import { afterAll, beforeAll } from 'vite-plus/test';
import { createApp } from '#/server.ts';

type Reply = { status: number; body: unknown };

/**
 * The API on a free port for the test file, and calls to `prefix` under it, as a website or core
 * makes them. `token` goes in the `Authorization` header; a 204 answers `{}`.
 */
export const serve = (prefix: string) => {
  let base = '';
  let server: ReturnType<ReturnType<typeof createApp>['listen']>;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = createApp().listen(0, () => resolve());
    });

    const address = server.address();

    if (!address || typeof address === 'string') throw new Error('not listening on a port');

    base = `http://127.0.0.1:${address.port}${prefix}`;
  });

  afterAll(() => {
    server.close();
  });

  const call = async (path: string, init: RequestInit, token?: string): Promise<Reply> => {
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
    });

    return { status: response.status, body: response.status === 204 ? {} : await response.json() };
  };

  return {
    url: (path: string) => `${base}${path}`,
    post: (path: string, body: unknown, token?: string) =>
      call(path, { method: 'POST', body: JSON.stringify(body) }, token),
    get: (path: string, token?: string) => call(path, {}, token),
  };
};
