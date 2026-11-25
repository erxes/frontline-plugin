import { randomUUID } from 'node:crypto';
import { PERMISSIONS_EXTENSION, READS_EXTENSION } from '@erxes/core-contract';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { createApp } from '#/server.ts';
import { fakeCoreSessions } from '#/test/session.ts';

const Operation = z.object({
  operationId: z.string(),
  summary: z.string().optional(),
  [READS_EXTENSION]: z.literal(true).optional(),
  [PERMISSIONS_EXTENSION]: z.array(z.string()).optional(),
});

const MemberDoc = z.object({
  paths: z.record(z.string(), z.object({ post: Operation.optional(), get: Operation.optional() })),
});

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let tokens: Awaited<ReturnType<typeof fakeCoreSessions>>;

beforeAll(async () => {
  tokens = await fakeCoreSessions();

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

const operations = async () => {
  const doc = MemberDoc.parse(await (await fetch(`${base}/api/openapi/member.json`)).json());

  return Object.values(doc.paths).flatMap((item) => [item.post, item.get].filter((op) => !!op));
};

const operation = async (id: string) => (await operations()).find((op) => op.operationId === id);

describe('the assistant calls the member routes', () => {
  it('reads a report for a date range sent as JSON', async () => {
    const token = await tokens.session(`org-${randomUUID()}`, 'user-1', [PERMISSIONS.inboxView]);

    const response = await fetch(`${base}/api/v1/reports/conversations`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: '2026-10-01', to: '2026-10-31', timeZone: 'Asia/Ulaanbaatar' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ started: 0, resolved: 0 });
  });

  it('runs a report as a read and a ticket change as a write, each with its permission', async () => {
    expect(await operation('reports.conversations')).toMatchObject({
      [READS_EXTENSION]: true,
      [PERMISSIONS_EXTENSION]: [PERMISSIONS.inboxView],
    });

    const create = await operation('tickets.create');

    expect(create?.[READS_EXTENSION]).toBeUndefined();
    expect(create?.[PERMISSIONS_EXTENSION]?.length).toBeGreaterThan(0);
  });

  it('says what every route does', async () => {
    const unsaid = (await operations())
      .filter((op) => !op.summary?.trim())
      .map((op) => op.operationId);

    expect(unsaid).toEqual([]);
  });
});
