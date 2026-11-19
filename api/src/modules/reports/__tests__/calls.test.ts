import { describe, expect, it } from 'vite-plus/test';
import { calls } from '#/db/calls.ts';
import { withOrg } from '#/db/client.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { answeredBy, at, conversation, PERIOD, setUp } from '#/test/reports.ts';

describe('call report', () => {
  it('counts the period’s calls, waits, talk time and callbacks by day, hour of the week, agent, number and queue', async () => {
    const orgId = 'org-rp-calls';
    const { teammate, owner, inOurs, inOther } = await setUp(orgId);
    const line = await conversation(orgId, inOurs, { createdAt: at('2026-02-01T00:00:00Z') });
    const otherLine = await conversation(orgId, inOther, { createdAt: at('2026-02-01T00:00:00Z') });

    await withOrg(orgId, async (tx) => {
      const [account] = await tx
        .insert(integrationAccounts)
        .values({
          orgId,
          provider: 'callpro',
          externalId: '75550000',
          name: '75550000',
          secret: 'sealed',
          createdBy: 'owner',
        })
        .returning({ id: integrationAccounts.id });

      const call = (
        callKey: string,
        startedAt: Date,
        values: Partial<typeof calls.$inferInsert> = {},
      ) => ({
        orgId,
        accountId: account?.id ?? '',
        conversationId: line,
        customerId: 'customer-1',
        callKey,
        direction: 'incoming' as const,
        status: 'answered' as const,
        customerPhone: '99110000',
        startedAt,
        ...values,
      });

      // 10:00 and 11:00 on Sunday 1 March, then on Monday 2 March, in Ulaanbaatar.
      const sunday = at('2026-03-01T02:00:00Z');
      const sundayLater = at('2026-03-01T03:00:00Z');
      const monday = at('2026-03-02T02:00:00Z');
      const mondayLater = at('2026-03-02T03:00:00Z');

      await tx.insert(calls).values([
        call('k1', sunday, { queue: '6501', ...answeredBy(sunday, 10, 120) }),
        call('k2', sundayLater, { queue: '6501', ...answeredBy(sundayLater, 30, 60) }),
        call('k3', monday, {
          queue: '6502',
          status: 'missed',
          customerPhone: '88000000',
          endedAt: new Date(monday.getTime() + 15_000),
        }),
        // Nobody calls this one back, and this caller hangs up before an agent could answer.
        call('k7', monday, {
          queue: '6502',
          status: 'busy',
          customerPhone: '77000000',
          endedAt: new Date(monday.getTime() + 30_000),
        }),
        call('k8', sunday, {
          status: 'missed',
          customerPhone: '66000000',
          endedAt: new Date(sunday.getTime() + 2000),
        }),
        // The missed call is called back an hour later, and answered.
        call('k4', mondayLater, {
          direction: 'outgoing',
          customerPhone: '88000000',
          ...answeredBy(mondayLater, 5, 30),
        }),
        call('k5', at('2026-02-10T02:00:00Z')),
        call('k6', sunday, { conversationId: otherLine }),
      ]);
    });

    const report = await teammate.reports.calls(PERIOD);

    expect({
      ...report,
      breaches: report.breaches.map(({ id: _, ...breach }) => breach),
    }).toEqual({
      total: 6,
      incoming: 5,
      outgoing: 1,
      answered: 3,
      answeredIncoming: 2,
      missed: 3,
      waitSeconds: 20,
      talkSeconds: 70,
      serviceLevel: 1 / 5,
      serviceLevelSeconds: 20,
      days: [
        { day: '2026-03-01', incoming: 3, outgoing: 0, answered: 2, missed: 1 },
        { day: '2026-03-02', incoming: 2, outgoing: 1, answered: 1, missed: 2 },
        { day: '2026-03-03', incoming: 0, outgoing: 0, answered: 0, missed: 0 },
      ],
      hours: [
        { weekday: 1, hour: 10, total: 2, answered: 0 },
        { weekday: 1, hour: 11, total: 1, answered: 1 },
        { weekday: 7, hour: 10, total: 2, answered: 1 },
        { weekday: 7, hour: 11, total: 1, answered: 1 },
      ],
      agents: [
        {
          userId: 'teammate',
          answered: 3,
          talkSeconds: 210,
          shortestSeconds: 30,
          longestSeconds: 120,
        },
      ],
      numbers: [
        { customerPhone: '88000000', total: 2, answered: 1, missed: 1 },
        { customerPhone: '99110000', total: 2, answered: 2, missed: 0 },
        { customerPhone: '66000000', total: 1, answered: 0, missed: 1 },
        { customerPhone: '77000000', total: 1, answered: 0, missed: 1 },
      ],
      queues: [
        { queue: '6501', total: 2, answered: 2, missed: 0, waitSeconds: 20, talkSeconds: 90 },
        { queue: '6502', total: 2, answered: 0, missed: 2, waitSeconds: null, talkSeconds: null },
      ],
      calledBack: 1,
      reached: 1,
      callbackSeconds: 3585,
      callbackHours: 24,
      // The hang-up after 2 s was never offered; the called-back call counts as served.
      shortHangupSeconds: 5,
      service: { offered: 4, served: 3, breached: 1, shortHangups: 1, pending: 0 },
      serviceDays: [
        { day: '2026-03-01', offered: 2, served: 2, breached: 0 },
        { day: '2026-03-02', offered: 2, served: 1, breached: 1 },
        { day: '2026-03-03', offered: 0, served: 0, breached: 0 },
      ],
      serviceQueues: [
        { queue: '6501', offered: 2, served: 2, breached: 0, calledBack: 0 },
        { queue: '6502', offered: 2, served: 1, breached: 1, calledBack: 1 },
      ],
      missedReasons: [
        { reason: 'short', count: 1, calledBack: 0 },
        { reason: 'missed', count: 1, calledBack: 1 },
        { reason: 'busy', count: 1, calledBack: 0 },
      ],
      breaches: [
        {
          startedAt: at('2026-03-02T02:00:00Z'),
          customerPhone: '77000000',
          queue: '6502',
          waitSeconds: 30,
          pending: false,
        },
      ],
    });

    await expect(owner.reports.calls(PERIOD)).resolves.toMatchObject({ total: 7 });

    // A call older than the period still counts once it falls in a longer one.
    await expect(
      teammate.reports.calls({ ...PERIOD, from: at('2026-02-01T00:00:00Z') }),
    ).resolves.toMatchObject({ total: 7 });
  });
});
