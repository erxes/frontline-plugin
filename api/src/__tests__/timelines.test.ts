import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import { createApp } from '#/server.ts';
import { coreRoles } from '#/test/coreUnits.ts';
import { clientAs } from '#/test/member.ts';
import { fakeCoreSessions } from '#/test/session.ts';

// Core checks a new ticket's fields and tells a user's role.
vi.mock('#/core.ts', async (importOriginal) =>
  (await import('#/test/coreUnits.ts')).unitsStandIn(await importOriginal()),
);

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;
let tokens: Awaited<ReturnType<typeof fakeCoreSessions>>;

beforeAll(async () => {
  tokens = await fakeCoreSessions();
  coreRoles['user-admin'] = 'admin';

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

describe('timeline access', () => {
  it('tells core whether a member sees a record whose timeline they ask for', async () => {
    const orgId = `org-${randomUUID()}`;
    const owner = clientAs(orgId);
    const mine = await owner.channels.create({ name: 'Mine', memberIds: ['user-1'] });
    const theirs = await owner.channels.create({ name: 'Theirs', memberIds: ['user-2'] });
    const pipeline = await owner.pipelines.create({ channelId: mine.id, name: 'Main' });
    const ticket = await owner.tickets.create({ pipelineId: pipeline.id, name: 'Payroll' });

    const ask = async (userId: string, type: string, id: string, signed?: string) => {
      const body = JSON.stringify({ orgId, userId, type, id });
      const token = await tokens.timelineAccess(signed ?? body, orgId);

      const response = await fetch(`${base}/api/timelines/access`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body,
      });

      return { status: response.status, body: await response.json() };
    };

    const allowed = async (userId: string, type: string, id: string) =>
      (await ask(userId, type, id)).body;

    expect(await allowed('user-1', 'frontline.channel', mine.id)).toEqual({ allowed: true });
    expect(await allowed('user-1', 'frontline.channel', theirs.id)).toEqual({ allowed: false });
    // An admin's role holds every permission, so they see every channel.
    expect(await allowed('user-admin', 'frontline.channel', theirs.id)).toEqual({ allowed: true });
    expect(await allowed('user-2', 'frontline.ticket', ticket.id)).toEqual({ allowed: false });
    expect(await allowed('user-1', 'frontline.ticket', ticket.id)).toEqual({ allowed: true });

    await owner.pipelines.statuses.update({
      id: ticket.statusId,
      visibilityType: 'private',
      memberIds: ['user-2'],
    });

    expect(await allowed('user-1', 'frontline.ticket', ticket.id)).toEqual({ allowed: false });
    expect(await allowed('user-1', 'frontline.nothing', mine.id)).toEqual({ allowed: false });

    // A personal inbox is its owner's alone, an admin's role notwithstanding.
    const own = clientAs(orgId, undefined, 'user-3');
    const inbox = await own.channels.personal();
    const inboxPipeline = await own.pipelines.create({ channelId: inbox.id, name: 'Mine' });
    const note = await own.tickets.create({ pipelineId: inboxPipeline.id, name: 'Note' });

    expect(await allowed('user-3', 'frontline.ticket', note.id)).toEqual({ allowed: true });
    expect(await allowed('user-admin', 'frontline.ticket', note.id)).toEqual({ allowed: false });
    expect(await allowed('user-admin', 'frontline.channel', inbox.id)).toEqual({ allowed: false });
    // Only core asks, over the body it signed.
    expect(await ask('user-1', 'frontline.channel', theirs.id, '{}')).toMatchObject({
      status: 401,
    });
  });
});
