import { describe, expect, it, vi } from 'vite-plus/test';
import { Cdr } from '../../integrations/providers/call/cdr.ts';
import { runQueued } from '../../integrations/__tests__/fakes.ts';
import { fakePbx, fixture, PBX, pbxServer } from './pbx.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).sdkStandIn(await importOriginal()),
);

const { connectPbx } = pbxServer();

describe('an answered call', () => {
  it('asks the PBX for a recording its CDR did not name yet', async () => {
    const actions = fakePbx({ answers: { getRecordInfosByCall: { recordfiles: 'later.wav@' } } });
    const { owner, post } = await connectPbx('org-call-late-recording');
    const cdr = { ...Cdr.parse(JSON.parse(fixture('cdr-answered.json'))), recordfiles: '' };

    expect(await post('cdr', JSON.stringify(cdr))).toBe(200);
    await runQueued();

    expect(actions.filter(({ action }) => action === 'recapi').at(-1)).toMatchObject({
      filedir: 'queue',
      filename: 'later.wav',
    });
    expect((await owner.calls.list({})).calls[0]?.recording).toMatchObject({ name: 'later.wav' });
  });

  it('knows an operator listed on another account of the same PBX', async () => {
    fakePbx();
    const { owner, post } = await connectPbx('org-call-peer');

    await owner.integrations.call.connect({
      ...PBX,
      srcTrunk: 'other',
      operators: [{ userId: 'user-tuya', extension: '1003' }],
    });

    const cdr = {
      ...Cdr.parse(JSON.parse(fixture('cdr-answered.json'))),
      dstanswer: '1003',
      dstchannel_ext: '1003',
    };

    expect(await post('cdr', JSON.stringify(cdr))).toBe(200);
    expect((await owner.calls.list({})).calls[0]).toMatchObject({
      extension: '1003',
      answeredBy: 'user-tuya',
    });
  });
});
