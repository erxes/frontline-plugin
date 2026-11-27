import { describe, expect, it, vi } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';
import { fakePbx, fixture, pbxServer } from './pbx.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).sdkStandIn(await importOriginal()),
);

const { connectPbx } = pbxServer();

describe('call queues', () => {
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
    expect(queue.live?.agents[0]).toMatchObject({ extension: '1001', pausedAt: null });
    expect(queue.live?.agents[1]).toMatchObject({
      extension: '1002',
      name: 'Saraa Dorj',
      status: 'InUse',
      pausedAt: '2026-11-14 09:12:00',
    });
    expect(queue.live?.waiting).toEqual([{ callerId: '88001122', channel: 'PJSIP/trunk-0001' }]);

    // Someone who answers no PBX sees none of its queues.
    expect(
      await clientAs('org-call-d', [PERMISSIONS.callView], 'user-other').calls.queues.list({}),
    ).toEqual([]);

    // The live board says 1002 is on a call, so Saraa takes queue calls, with her day so far; her
    // pausetime is only when she last paused.
    const [mine] = await saraa.calls.agents.mine({});

    expect(mine).toMatchObject({
      extension: '1002',
      status: 'available',
      answered: 9,
      abandoned: 0,
      talkSeconds: 2400,
    });
    expect(mine?.heardAt).toBeInstanceOf(Date);

    // Paused on her desk phone: the next board says so, and frontline follows.
    const deskPause = fixture('queue-live.json').replace('"InUse"', '"Paused"');

    expect(await post('queue-live', deskPause)).toBe(200);
    expect(await saraa.calls.agents.mine({})).toMatchObject([{ status: 'paused' }]);

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
