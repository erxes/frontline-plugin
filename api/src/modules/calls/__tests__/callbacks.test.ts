import { describe, expect, it, vi } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';
import { fakePbx, pbxServer } from './pbx.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('../../integrations/__tests__/standIns.ts')).sdkStandIn(await importOriginal()),
);

const { connectPbx } = pbxServer();

type Post = (kind: string, body: string) => Promise<number>;

/** A call that rings at `at` and ends as the PBX says: unanswered, or talked on. */
const ring = async (
  post: Post,
  {
    id,
    phone,
    at,
    direction = 'incoming',
    talked = false,
  }: {
    id: string;
    phone: string;
    at: string;
    direction?: 'incoming' | 'outgoing';
    talked?: boolean;
  },
) => {
  const ends = { uniqueid: id, callType: direction };
  const party = direction === 'incoming' ? { callerIdNum: phone } : { calleeIdNum: phone };

  expect(
    await post('event', JSON.stringify({ type: 'ringing', ...ends, ...party, startedAt: at })),
  ).toBe(200);

  if (talked)
    expect(
      await post(
        'event',
        JSON.stringify({ type: 'answered', ...ends, ...party, extension: '1002' }),
      ),
    ).toBe(200);

  expect(await post('event', JSON.stringify({ type: 'hangup', ...ends, ...party }))).toBe(200);
};

describe('callbacks', () => {
  it('lists each caller nobody has talked to since, and drops them once someone does', async () => {
    fakePbx();
    const { owner, post } = await connectPbx('org-callback-a');

    await ring(post, { id: 'a.1', phone: '88001122', at: '2026-11-15 09:00:00' });
    await ring(post, { id: 'a.2', phone: '88001122', at: '2026-11-15 09:20:00' });
    await ring(post, { id: 'b.1', phone: '99001100', at: '2026-11-15 09:10:00' });
    // Answered: nothing to call back.
    await ring(post, { id: 'c.1', phone: '95550000', at: '2026-11-15 09:30:00', talked: true });

    const first = await owner.calls.callbacks.list({});

    // One row a caller, by their latest call, newest first, with how often they rang.
    expect(first.totalCount).toBe(2);
    expect(first.calls).toMatchObject([
      { customerPhone: '88001122', callKey: 'a.2', missedCount: 2 },
      { customerPhone: '99001100', callKey: 'b.1', missedCount: 1 },
    ]);
    expect((await owner.calls.callbacks.list({ customerPhone: '99001100' })).calls).toMatchObject([
      { customerPhone: '99001100' },
    ]);

    // A member calls 88001122 back and they pick up.
    await ring(post, {
      id: 'd.1',
      phone: '88001122',
      at: '2026-11-15 10:00:00',
      direction: 'outgoing',
      talked: true,
    });

    expect((await owner.calls.callbacks.list({})).calls).toMatchObject([
      { customerPhone: '99001100' },
    ]);

    // Rang again after the talk: a new callback that counts only the new miss.
    await ring(post, { id: 'e.1', phone: '88001122', at: '2026-11-15 11:00:00' });

    expect((await owner.calls.callbacks.list({})).calls).toMatchObject([
      { customerPhone: '88001122', callKey: 'e.1', missedCount: 1 },
      { customerPhone: '99001100' },
    ]);
  });

  it("shows only the caller's channels' callbacks, and none to another organisation", async () => {
    fakePbx();
    const { post } = await connectPbx('org-callback-b');

    await ring(post, { id: 'f.1', phone: '88001122', at: '2026-11-15 09:00:00' });

    // In no channel of the line.
    expect(
      (
        await clientAs('org-callback-b', [PERMISSIONS.callView], 'user-other').calls.callbacks.list(
          {},
        )
      ).calls,
    ).toEqual([]);
    expect((await clientAs('org-callback-other').calls.callbacks.list({})).calls).toEqual([]);
  });
});
