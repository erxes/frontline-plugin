import { describe, expect, it, vi } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';
import { fakePbx, PBX, pbxServer } from './pbx.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).sdkStandIn(await importOriginal()),
);

const { connectPbx } = pbxServer();

const TRUNKS = { srcTrunk: '02_MTC_in', dstTrunk: '02_MTC_out' };

describe("a PBX set up with the old form's fields", () => {
  it('connects with its name, trunks, queues and operators in one go', async () => {
    fakePbx();

    const owner = clientAs('org-pbx-form');

    const account = await owner.integrations.call.connect({
      ...PBX,
      ...TRUNKS,
      name: 'Erkhet line',
      queues: [{ queue: '6500', name: 'Sales' }],
      operators: [{ userId: 'user-saraa', extension: '1002', sipPassword: 'sip-secret' }],
    });

    expect(account).toMatchObject({ name: 'Erkhet line', config: { ...TRUNKS, host: PBX.host } });

    const settings = await owner.integrations.call.settings({ accountId: account.id });

    expect(settings.queues).toMatchObject([{ queue: '6500', name: 'Sales' }]);
    expect(settings.operators).toMatchObject([
      { userId: 'user-saraa', extension: '1002', hasSipPassword: true },
    ]);

    // The panel saves everything again with each change; the name and the SIP password stay.
    const saved = await owner.integrations.call.saveSettings({
      accountId: account.id,
      ...PBX,
      ...TRUNKS,
      name: 'Erkhet line',
      dstTrunk: '03_Unitel_out',
      queues: settings.queues,
      operators: [{ userId: 'user-saraa', extension: '1002' }],
    });

    expect(saved).toMatchObject({ name: 'Erkhet line', config: { dstTrunk: '03_Unitel_out' } });
    expect(
      (await owner.integrations.call.settings({ accountId: account.id })).operators,
    ).toMatchObject([{ hasSipPassword: true }]);

    // Without a name, it goes by its number, as before.
    expect(
      await owner.integrations.call.saveSettings({
        accountId: account.id,
        ...PBX,
        queues: [],
        operators: [],
      }),
    ).toMatchObject({ name: PBX.phone });
  });

  it('shows another organisation nothing and refuses a member who may not connect', async () => {
    fakePbx();

    const account = await clientAs('org-pbx-form-b').integrations.call.connect(PBX);

    await expect(
      clientAs('org-pbx-form-c').integrations.call.settings({ accountId: account.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    await expect(
      clientAs('org-pbx-form-b', [PERMISSIONS.callView]).integrations.call.connect({
        ...PBX,
        queues: [{ queue: '6500', name: 'Sales' }],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it("tells a live call's direction by the account's trunks", async () => {
    fakePbx();

    const { owner, account, post } = await connectPbx('org-pbx-trunks');
    const { queues, operators } = await owner.integrations.call.settings({ accountId: account.id });

    await owner.integrations.call.saveSettings({
      accountId: account.id,
      ...PBX,
      ...TRUNKS,
      queues,
      operators: operators.map(({ userId, extension }) => ({ userId, extension })),
    });

    // Neither event says its type; the trunks do.
    const inbound = {
      type: 'ringing',
      uniqueid: '1763173333.1',
      srcTrunkName: TRUNKS.srcTrunk,
      dstTrunkName: 'internal',
      callerIdNum: '88001122',
    };

    const outbound = {
      type: 'ringing',
      uniqueid: '1763173333.2',
      srcTrunkName: 'internal',
      dstTrunkName: TRUNKS.dstTrunk,
      calleeIdNum: '99887766',
    };

    expect(await post('event', JSON.stringify(inbound))).toBe(200);
    expect(await post('event', JSON.stringify(outbound))).toBe(200);

    const { calls } = await owner.calls.list({});

    expect(calls.map(({ customerPhone, direction }) => ({ customerPhone, direction }))).toEqual(
      expect.arrayContaining([
        { customerPhone: '88001122', direction: 'incoming' },
        { customerPhone: '99887766', direction: 'outgoing' },
      ]),
    );
  });
});
