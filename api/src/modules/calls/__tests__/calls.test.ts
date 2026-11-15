import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';
import { channelFor, runQueued, serve } from '../../integrations/__tests__/fakes.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).sdkStandIn(await importOriginal()),
);

const { deliver } = serve();

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const Request = z.object({
  request: z.object({ action: z.string() }).catchall(z.unknown()),
});

const realFetch = globalThis.fetch;

/**
 * A Grandstream UCM at `pbx.test` whose API user is `erxes` / `secret`, and core's storage.
 * Returns the actions frontline asked of the PBX, newest last.
 */
const fakePbx = () => {
  const actions: Record<string, unknown>[] = [];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new globalThis.Request(input, init);
    const url = new URL(request.url);

    if (url.hostname === '127.0.0.1') return realFetch(request);

    if (url.hostname === 'files.core.test') return new Response(null, { status: 200 });

    const { request: asked } = Request.parse(await request.json());

    actions.push(asked);

    switch (asked.action) {
      case 'challenge':
        return Response.json({ status: 0, response: { challenge: 'abc123' } });
      case 'login': {
        const good = createHash('md5').update('abc123secret').digest('hex');

        return Response.json(
          asked.token === good ? { status: 0, response: { cookie: 'cookie-1' } } : { status: -37 },
        );
      }

      case 'recapi':
        return new Response(new Uint8Array([82, 73, 70, 70]), {
          headers: { 'content-type': 'audio/wav' },
        });
      default:
        return Response.json({ status: 0, response: { need_apply: 'no' } });
    }
  });

  return actions;
};

const PBX = {
  host: 'pbx.test',
  apiUser: 'erxes',
  apiPassword: 'secret',
  phone: '77001100',
  timeZone: 'Asia/Ulaanbaatar',
};

/** A connected PBX in `orgId` with queue 6500, its operators and a channel for its calls. */
const connectPbx = async (orgId: string) => {
  const owner = clientAs(orgId);
  const account = await owner.integrations.call.connect(PBX);

  await owner.integrations.call.saveSettings({
    accountId: account.id,
    ...PBX,
    srcTrunk: 'mobicom',
    dstTrunk: '',
    queues: [{ queue: '6500', name: 'Sales' }],
    operators: [
      { userId: 'user-bold', extension: '1001' },
      { userId: 'user-saraa', extension: '1002' },
    ],
  });

  await channelFor(orgId, 'call', account.id);

  const settings = await owner.integrations.call.settings({ accountId: account.id });

  const path = new URL(settings.webhookUrl ?? '').pathname.replace('/api/public/webhooks', '');
  const secret = settings.webhookSecret ?? '';

  /** Posts `raw` to the PBX's `kind` address, signed as its bridge signs. */
  const post = (kind: string, raw: string, signedWith = secret) => {
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', signedWith).update(`${timestamp}.${raw}`).digest('hex');

    return deliver(`${path}/${kind}`, raw, {
      'x-erxes-timestamp': timestamp,
      'x-erxes-signature': signature,
    });
  };

  return { owner, account, post, path };
};

describe('calls through a PBX', () => {
  it('refuses a PBX that refuses its API user', async () => {
    fakePbx();

    await expect(
      clientAs('org-call-x').integrations.call.connect({ ...PBX, apiPassword: 'wrong' }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'The PBX refused: wrong API user or password',
    });
  });

  it('makes one call of its legs, in the inbox, with its operator and recording', async () => {
    const actions = fakePbx();
    const { owner, post, path } = await connectPbx('org-call-a');

    expect(await deliver(`${path}/cdr`, fixture('cdr-noanswer.json'))).toBe(401);
    expect(await post('cdr', fixture('cdr-noanswer.json'), 'forged')).toBe(401);
    expect(await post('cdr', fixture('cdr-noanswer.json'))).toBe(200);

    expect((await owner.calls.list({})).calls).toMatchObject([
      { status: 'missed', direction: 'incoming', customerPhone: '99112233', queue: '6500' },
    ]);

    expect(await post('cdr', fixture('cdr-answered.json'))).toBe(200);
    // The PBX sends a CDR again until it hears 200; the repeat adds nothing.
    expect(await post('cdr', fixture('cdr-answered.json'))).toBe(200);
    expect(await post('cdr', '{not json')).toBe(400);
    expect(await post('nothing', '{}')).toBe(404);

    const { calls, totalCount } = await owner.calls.list({});

    expect(totalCount).toBe(1);
    expect(calls[0]).toMatchObject({
      status: 'answered',
      extension: '1002',
      answeredBy: 'user-saraa',
      durationSec: 180,
      customerId: 'customer-99112233',
      number: '77001100',
      startedAt: new Date('2026-11-15T02:00:00Z'),
      answeredAt: new Date('2026-11-15T02:00:25Z'),
      endedAt: new Date('2026-11-15T02:03:25Z'),
      recordingFile: 'queue/auto-1763170000-1002-99112233.wav',
      recording: null,
    });

    const { conversations } = await owner.conversations.list({});

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      kind: 'call',
      customerId: 'customer-99112233',
      content: 'Incoming call from 99112233',
    });

    await runQueued();

    expect(actions.at(-1)).toMatchObject({
      action: 'recapi',
      filedir: 'queue',
      filename: 'auto-1763170000-1002-99112233.wav',
    });

    const call = await owner.calls.get({ conversationId: conversations[0]?.id ?? '' });

    expect(call.recording).toEqual({
      url: 'https://files.core.test/file-auto-1763170000-1002-99112233.wav',
      name: 'auto-1763170000-1002-99112233.wav',
      type: 'audio/wav',
      size: 4,
    });
    expect(call.recordingFile).toBeNull();

    const missed = await owner.calls.list({
      filter: JSON.stringify({
        match: 'all',
        rules: [{ path: 'subject.status', op: 'eq', value: 'missed' }],
      }),
    });

    expect(missed.totalCount).toBe(0);
    expect((await clientAs('org-call-b').calls.list({})).totalCount).toBe(0);
  });

  it('follows a call live: ringing, then missed when it hangs up unanswered', async () => {
    fakePbx();
    const { owner, post } = await connectPbx('org-call-c');

    const ringing = {
      type: 'incoming_call',
      caller: '88001122',
      did: '77001100',
      queue: '6500',
      uniqueid: '1763171111.5',
    };

    expect(await post('receive-call', JSON.stringify(ringing))).toBe(200);
    expect((await owner.calls.list({})).calls).toMatchObject([
      { status: 'ringing', customerPhone: '88001122' },
    ]);

    expect(
      await post(
        'event',
        JSON.stringify({
          type: 'hangup',
          uniqueid: '1763171111.5',
          callType: 'incoming',
          callerIdNum: '88001122',
        }),
      ),
    ).toBe(200);
    expect((await owner.calls.list({})).calls).toMatchObject([{ status: 'missed' }]);
  });

  it("shows a queue's counters and live board to its operators, and pauses an agent", async () => {
    const actions = fakePbx();
    const { post } = await connectPbx('org-call-d');

    expect(await post('queue-stats', fixture('queue-stats.json'))).toBe(200);
    expect(await post('queue-live', fixture('queue-live.json'))).toBe(200);

    const saraa = clientAs('org-call-d', [PERMISSIONS.callView], 'user-saraa');
    const queues = await saraa.calls.queues.list({});

    // 6599 is no queue the admin added.
    expect(queues).toMatchObject([
      {
        queue: '6500',
        name: 'Sales',
        totalCalls: 40,
        answeredCalls: 34,
        avgWait: 14.5,
        slaRate: 82.5,
      },
    ]);

    const queue = await saraa.calls.queues.get({ id: queues[0]?.id ?? '' });

    expect(queue.live?.agents).toHaveLength(2);
    expect(queue.live?.agents[1]).toMatchObject({
      extension: '1002',
      name: 'Saraa Dorj',
      status: 'InUse',
    });
    expect(queue.live?.waiting).toEqual([{ callerId: '88001122', channel: 'PJSIP/trunk-0001' }]);

    // Someone who answers no PBX sees none of its queues.
    expect(
      await clientAs('org-call-d', [PERMISSIONS.callView], 'user-other').calls.queues.list({}),
    ).toEqual([]);

    const [mine] = await saraa.calls.agents.mine({});

    expect(mine).toMatchObject({ extension: '1002', status: 'unavailable' });

    const paused = await saraa.calls.agents.setStatus({
      accountId: mine?.accountId ?? '',
      status: 'paused',
    });

    expect(paused.status).toBe('paused');
    expect(actions.at(-1)).toMatchObject({
      action: 'pauseUnpauseQueueAgent',
      operatetype: 'pause',
      interface: '1002',
    });

    await expect(
      clientAs('org-call-d', [PERMISSIONS.callView], 'user-other').calls.agents.setStatus({
        accountId: mine?.accountId ?? '',
        status: 'paused',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

const callProEvent = (disp: string) =>
  JSON.stringify({ callID: 'cp-1', numberFrom: '99887766', numberTo: '75557777', disp });

describe('calls through CallPro', () => {
  it('takes each call at the line address and settles it from its disposition', async () => {
    const owner = clientAs('org-callpro-a');
    const account = await owner.integrations.callpro.connect({ phone: '75557777' });

    await channelFor('org-callpro-a', 'callpro', account.id);

    const { webhookUrl } = await owner.integrations.call.settings({ accountId: account.id });
    const path = new URL(webhookUrl ?? '').pathname.replace('/api/public/webhooks', '');

    expect(await deliver('/callpro/no-such-key', callProEvent('ANSWERED'))).toBe(404);
    expect(await deliver(path, callProEvent('RINGING'))).toBe(200);
    expect((await owner.calls.list({})).calls).toMatchObject([{ status: 'ringing' }]);

    expect(await deliver(path, callProEvent('ANSWERED'))).toBe(200);

    const { calls } = await owner.calls.list({});

    expect(calls).toMatchObject([
      { status: 'answered', customerPhone: '99887766', number: '75557777', provider: 'callpro' },
    ]);
    await expect(owner.calls.fetchRecording({ id: calls[0]?.id ?? '' })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });
});
