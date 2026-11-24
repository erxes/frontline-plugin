import { describe, expect, it, vi } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';
import { channelFor, runQueued } from '../../integrations/__tests__/fakes.ts';
import { fakePbx, fixture, PBX, pbxServer } from './pbx.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).sdkStandIn(await importOriginal()),
);

const { deliver, connectPbx } = pbxServer();

describe('calls through a PBX', () => {
  it('refuses a PBX that refuses its API user', async () => {
    // The PBX knows the install's API user by another password than CALL_API_PASSWORD.
    fakePbx({ password: 'changed-on-the-pbx' });

    await expect(clientAs('org-call-x').integrations.call.connect(PBX)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'The PBX refused: wrong API user or password',
    });

    // A PBX that refuses the connection says so.
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new TypeError('fetch failed', {
        cause: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
      }),
    );

    await expect(clientAs('org-call-x').integrations.call.connect(PBX)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'The PBX is unreachable: it refused the connection',
    });

    // A PBX is never the API's own network, loopback or the metadata service.
    for (const host of ['10.0.0.5', '127.0.0.1:8089', '169.254.169.254', '169.254.169.254.'])
      await expect(
        clientAs('org-call-x').integrations.call.connect({ ...PBX, host }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('makes one call of its legs, in the inbox, with its operator and recording', async () => {
    const actions = fakePbx();
    const { owner, post, path } = await connectPbx('org-call-a');

    expect(await deliver(`${path}/cdr`, fixture('cdr-noanswer.json'))).toBe(401);
    expect(await post('cdr', fixture('cdr-noanswer.json'), 'forged')).toBe(401);
    expect(await post('cdr', fixture('cdr-noanswer.json'))).toBe(200);

    expect((await owner.calls.list({})).calls).toMatchObject([
      {
        status: 'missed',
        direction: 'incoming',
        customerPhone: '99112233',
        queue: '6500',
        queueName: 'Sales',
      },
    ]);

    expect(await post('cdr', fixture('cdr-answered.json'))).toBe(200);
    // The PBX sends a CDR again until it hears 200; the repeat adds nothing.
    expect(await post('cdr', fixture('cdr-answered.json'))).toBe(200);
    expect(await post('cdr', '{not json')).toBe(400);
    expect(await post('nothing', '{}')).toBe(404);
    // Names every object has are no kind of post either.
    expect(await post('constructor', '{}')).toBe(404);
    expect(await post('toString', '{}')).toBe(404);

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
      url: '/core/v1/files/file-auto-1763170000-1002-99112233-wav/download',
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

  it('makes one call of the first posts of a new call that come at once', async () => {
    fakePbx();
    const { owner, post } = await connectPbx('org-call-f');

    // The ringing event names no queue, as when the UCM sends it before the queue answers.
    const ringing = JSON.stringify({
      type: 'incoming_call',
      caller: '99112233',
      uniqueid: '1763170000.10',
    });

    expect(
      await Promise.all([
        post('cdr', fixture('cdr-noanswer.json')),
        post('cdr', fixture('cdr-answered.json')),
        post('receive-call', ringing),
        post('cdr', fixture('cdr-noanswer.json')),
      ]),
    ).toEqual([200, 200, 200, 200]);

    expect((await owner.calls.list({})).calls).toMatchObject([
      { status: 'answered', customerPhone: '99112233' },
    ]);
    expect((await owner.conversations.list({})).conversations).toHaveLength(1);
  });

  it('says a PBX in no active channel drops its calls', async () => {
    fakePbx();
    const { owner, account, post } = await connectPbx('org-call-g');
    const settings = () => owner.integrations.call.settings({ accountId: account.id });

    expect(await settings()).toMatchObject({ inChannel: true });

    const [integration] = await owner.integrations.list({});

    await owner.integrations.update({ id: integration?.id ?? '', isActive: false });

    expect(await post('cdr', fixture('cdr-noanswer.json'))).toBe(200);
    expect((await owner.calls.list({})).totalCount).toBe(0);
    expect(await settings()).toMatchObject({ inChannel: false });
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

  it("gives an operator's softphone its line, the call it is on, and transfers it", async () => {
    const actions = fakePbx();
    const { owner, account, post } = await connectPbx('org-call-e');

    await owner.integrations.call.saveSettings({
      accountId: account.id,
      ...PBX,
      queues: [],
      operators: [
        { userId: 'user-bold', extension: '1001' },
        { userId: 'user-saraa', extension: '1002', sipPassword: 'sip-1002' },
      ],
    });

    const settings = await owner.integrations.call.settings({ accountId: account.id });

    expect(settings.operators).toEqual([
      expect.objectContaining({ extension: '1001', hasSipPassword: false }),
      expect.objectContaining({ extension: '1002', hasSipPassword: true }),
    ]);
    expect(JSON.stringify(settings)).not.toContain('sip-1002');
    expect(JSON.stringify(await owner.integrations.accounts.list({}))).not.toContain('sip-1002');

    const saraa = clientAs('org-call-e', [PERMISSIONS.callView], 'user-saraa');

    expect(await saraa.calls.phone.lines({})).toEqual([
      {
        accountId: account.id,
        name: '77001100',
        extension: '1002',
        password: 'sip-1002',
        webSocketUrl: 'wss://pbx.test/ws',
      },
    ]);
    // Bold has an extension but no SIP password, so no softphone.
    expect(
      await clientAs('org-call-e', [PERMISSIONS.callView], 'user-bold').calls.phone.lines({}),
    ).toEqual([]);

    expect(await saraa.calls.phone.extensions({ accountId: account.id })).toEqual([
      { extension: '1001', name: 'Bold Bat', status: 'Idle' },
    ]);

    expect(await saraa.calls.phone.current({ accountId: account.id })).toBeNull();

    const live = { uniqueid: '1763172222.7', callType: 'incoming', callerIdNum: '88001122' };

    expect(await post('event', JSON.stringify({ ...live, type: 'ringing' }))).toBe(200);
    expect(
      await post('event', JSON.stringify({ ...live, type: 'answered', extension: '1002' })),
    ).toBe(200);

    const current = await saraa.calls.phone.current({ accountId: account.id });

    expect(current).toMatchObject({ customerPhone: '88001122' });
    // The phone shows the caller by core's name; one core no longer has stays a number.
    expect(await saraa.calls.phone.caller({ customerId: current?.customerId ?? '' })).toEqual({
      name: 'Dulam Dorj',
    });
    await expect(
      saraa.calls.phone.caller({ customerId: 'customer-of-no-call' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(
      (await owner.calls.get({ conversationId: current?.conversationId ?? '' })).answeredBy,
    ).toBe('user-saraa');

    await saraa.calls.phone.transfer({ accountId: account.id, extension: '1001' });

    expect(actions.at(-1)).toEqual({
      action: 'callTransfer',
      cookie: 'cookie-1',
      extension: '1001',
      channel: 'PJSIP/1002-0003',
    });

    await expect(
      clientAs('org-call-e', [PERMISSIONS.callView], 'user-bold').calls.phone.transfer({
        accountId: account.id,
        extension: '1002',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'You are on no call to transfer' });
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
