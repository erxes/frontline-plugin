import { describe, expect, it, vi } from 'vite-plus/test';
import { clientAs } from '#/test/member.ts';
import { fakePbx, fixture, PBX, pbxServer } from './pbx.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).sdkStandIn(await importOriginal()),
);

const { connectPbx } = pbxServer();

/** A CDR leg of call `linkedid`, as the PBX posts one per step of the call. */
const leg = (AcctId: string, linkedid: string, action_type: string) =>
  JSON.stringify({ ...JSON.parse(fixture('cdr-noanswer.json')), AcctId, linkedid, action_type });

describe("a PBX's queues in their own channels", () => {
  it('sends a queue call to its channel, even when the call opens in the phone menu', async () => {
    fakePbx();

    const { owner, account, post } = await connectPbx('org-call-qc');
    const misheel = await owner.channels.create({ name: 'Misheel' });

    const save = (channelId: string | null) =>
      owner.integrations.call.saveSettings({
        accountId: account.id,
        ...PBX,
        queues: [
          { queue: '6500', name: 'Sales' },
          { queue: '6523', name: 'Misheel', channelId },
        ],
        operators: [],
      });

    await save(misheel.id);

    expect(
      (await owner.integrations.call.settings({ accountId: account.id })).queues,
    ).toMatchObject([
      { queue: '6500', channelId: null },
      { queue: '6523', channelId: misheel.id },
    ]);

    // The call rings in the phone menu, before any queue: it opens in the account's own channel.
    const menu = { uniqueid: '1763180000.1', callType: 'incoming', callerIdNum: '88001122' };

    expect(await post('event', JSON.stringify({ ...menu, type: 'ringing' }))).toBe(200);

    const channelOfCall = async (phone: string) => {
      const { conversations } = await owner.conversations.list({});

      return conversations.find((conversation) => conversation.content?.includes(phone))?.channelId;
    };

    const own = await channelOfCall('88001122');

    expect(own).toBeDefined();
    expect(own).not.toBe(misheel.id);

    // Its legs follow: the menu's, then the queue's, which moves the call into Misheel's channel.
    expect(await post('cdr', leg('2001', '1763180000.1', 'IVR[7079]'))).toBe(200);
    expect(await post('cdr', leg('2002', '1763180000.1', 'QUEUE[6523]'))).toBe(200);

    expect(await channelOfCall('88001122')).toBe(misheel.id);
    expect((await owner.calls.list({})).calls).toMatchObject([{ queue: '6523' }]);

    // A queue in no other channel keeps the account's own.
    expect(await post('cdr', leg('2003', '1763180009.1', 'QUEUE[6500]'))).toBe(200);
    expect(await channelOfCall('99112233')).toBe(own);

    // Taking the queue back to the account's channel archives Misheel's integration, keeping
    // the call it holds.
    await save(null);

    expect(
      (await owner.integrations.call.settings({ accountId: account.id })).queues,
    ).toMatchObject([
      { queue: '6500', channelId: null },
      { queue: '6523', channelId: null },
    ]);
    expect(await channelOfCall('88001122')).toBe(misheel.id);

    // A member who isn't the channel's admin can't send a queue into it: it isn't theirs to see.
    await expect(
      clientAs(
        'org-call-qc',
        ['frontline.integration.manage'],
        'user-plain',
      ).integrations.call.saveSettings({
        accountId: account.id,
        ...PBX,
        queues: [{ queue: '6523', name: 'Misheel', channelId: misheel.id }],
        operators: [],
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
