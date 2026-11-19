import { randomUUID } from 'node:crypto';
import { PLUGIN_SESSION_SCHEME } from '@erxes/core-contract';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { config } from '#/config.ts';
import type * as CoreModule from '#/core.ts';
import { PERMISSIONS } from '#/core.ts';
import { createApp } from '#/server.ts';
import { clientAs } from '#/test/member.ts';
import { fakeCoreSessions } from '#/test/session.ts';

/** The plugin's plan as core answers it for an organisation; a test changes it. */
const plan = vi.hoisted(() => ({ access: 'full' as 'full' | 'off' | 'read_only' }));

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
            access: plan.access,
            readOnlyUntil: null,
          }),
        },
      }),
    },
  };
});

/** The parts of the OpenAPI document these tests read. */
const OpenApiDoc = z.object({
  servers: z.array(z.object({ url: z.string() })),
  paths: z.record(z.string(), z.unknown()),
  security: z.array(z.record(z.string(), z.array(z.string()))),
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

/** A REST call of a procedure with `token`. */
const call = async (path: string, token: string, body = '{}') =>
  fetch(`${base}/api/v1/${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body,
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
    const token = await tokens.session(`org-${randomUUID()}`, 'user-1', [PERMISSIONS.channelView]);

    expect((await fetch(url, { method: 'POST' })).status).toBe(401);

    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ channels: [] });
  });

  it('serves the procedures to the desktop app, by its access token and the plan core answers', async () => {
    const granted = [PERMISSIONS.channelView, PERMISSIONS.channelManage];

    const list = await call(
      'channels/list',
      await tokens.access(`org-${randomUUID()}`, 'u', granted),
    );

    expect(list.status).toBe(200);
    expect(await list.json()).toMatchObject({ channels: [] });
    expect((await call('channels/list', 'forged')).status).toBe(401);
    // The member's permissions hold as they do in web.
    expect(
      (await call('channels/list', await tokens.access(`org-${randomUUID()}`, 'u', []))).status,
    ).toBe(403);

    // An organisation whose plan is read-only reads and changes nothing.
    plan.access = 'read_only';
    const readOnly = await tokens.access(`org-${randomUUID()}`, 'u', granted);

    expect((await call('channels/list', readOnly)).status).toBe(200);
    expect((await call('channels/create', readOnly, '{"name":"Support"}')).status).toBe(403);

    // One the plugin is off in signs no one in.
    plan.access = 'off';
    expect(
      (await call('channels/list', await tokens.access(`org-${randomUUID()}`, 'u', granted)))
        .status,
    ).toBe(401);
    plan.access = 'full';
  });

  it('tells the desktop app where the API is, only when core forwards the call', async () => {
    const url = `${base}/api/public/desktop`;
    const token = await tokens.publicCall(`org-${randomUUID()}`);
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ apiUrl: `${config.publicUrl}/api` });
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: { authorization: 'Bearer forged' } })).status).toBe(401);
    // A member's own token is not core's forwarding token.
    expect(
      (
        await fetch(url, {
          headers: { authorization: `Bearer ${await tokens.session('org', 'u', [])}` },
        })
      ).status,
    ).toBe(401);
  });

  it('imports and exports tickets and form submissions for core, once per request', async () => {
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

      const token = await tokens.transfer(signed ?? body, { requestId, orgId });

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
        { rowNumber: 4, values: { name: 'Odd', pipeline: 'Main', customer: 'Bob' } },
      ],
    };

    const check = await post('import', { ...batch, dryRun: true });

    expect(await check.json()).toMatchObject({
      rows: [
        { rowNumber: 2, action: 'create' },
        { rowNumber: 3, action: 'error', error: 'No pipeline Nowhere in your channels' },
        { rowNumber: 4, action: 'error', error: 'Customer is an email or a phone, not Bob' },
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

    const form = await owner.forms.create({ channelId: channel.id, name: 'Contact' });
    const field = await owner.forms.fields.add({ formId: form.id, type: 'text', label: 'Topic' });
    const seats = await owner.forms.fields.add({ formId: form.id, type: 'number', label: 'Seats' });

    const submissions = (rows: { rowNumber: number; values: Record<string, string> }[]) =>
      post('import', {
        type: 'frontline:form_submission',
        importId: randomUUID(),
        mode: 'create',
        dryRun: false,
        rows,
      }).then((response) => response.json());

    expect(
      await submissions([
        { rowNumber: 2, values: { form: 'contact', answers: 'Topic: refund; still; Seats: 2' } },
        { rowNumber: 3, values: { form: 'Elsewhere' } },
        { rowNumber: 4, values: { form: 'Contact', answers: 'Seats: many' } },
      ]),
    ).toMatchObject({
      rows: [
        { rowNumber: 2, action: 'create' },
        { rowNumber: 3, action: 'error', error: 'No form Elsewhere in your channels' },
        { rowNumber: 4, action: 'error', error: 'Seats: Enter a number' },
      ],
    });

    const listed = await owner.forms.submissions.list({ formId: form.id });

    expect(listed.submissions).toMatchObject([
      { answers: { [field.id]: 'refund; still', [seats.id]: 2 } },
    ]);

    const exported = await post('export', {
      type: 'frontline:form_submission',
      columns: ['id', 'form', 'answers'],
      query: {},
      cursor: null,
      limit: 10,
    });

    const rows = [
      {
        id: listed.submissions[0]?.id,
        form: 'Contact',
        answers: ['Topic: refund; still', 'Seats: 2'],
      },
    ];

    expect(await exported.json()).toEqual({ cursor: null, rows });
    expect(
      await submissions([{ rowNumber: 2, values: { id: String(rows[0]?.id), form: 'Contact' } }]),
    ).toMatchObject({ rows: [{ rowNumber: 2, action: 'skip' }] });
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
