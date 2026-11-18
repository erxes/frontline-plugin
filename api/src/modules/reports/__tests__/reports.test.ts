import { inArray } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { calls } from '#/db/calls.ts';
import { withOrg } from '#/db/client.ts';
import { conversations, conversationTags, messages } from '#/db/inbox.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { tickets } from '#/db/tickets.ts';
import { clientAs } from '#/test/member.ts';

/** 1 to 3 March 2026 in Ulaanbaatar, UTC+8: 1 March is a Sunday. */
const PERIOD = {
  from: new Date('2026-03-01T00:00:00+08:00'),
  to: new Date('2026-03-04T00:00:00+08:00'),
  timeZone: 'Asia/Ulaanbaatar',
};

const at = (iso: string) => new Date(iso);

const seconds = (date: Date, add: number) => new Date(date.getTime() + add * 1000);

/** A call `teammate` answered `wait` seconds after it rang and talked for `durationSec`. */
const answeredBy = (startedAt: Date, wait: number, durationSec: number) => ({
  answeredAt: seconds(startedAt, wait),
  durationSec,
  answeredBy: 'teammate',
});

/**
 * An owner, a channel with `teammate` in it and another without, each with a messenger.
 * `teammate` may read the inbox, tickets and calls but manages no channel.
 */
const setUp = async (orgId: string) => {
  const owner = clientAs(orgId);

  const teammate = clientAs(
    orgId,
    [PERMISSIONS.channelView, PERMISSIONS.inboxView, PERMISSIONS.callView],
    'teammate',
  );

  const ours = await owner.channels.create({ name: 'Support', memberIds: ['teammate'] });
  const other = await owner.channels.create({ name: 'Sales' });

  const messenger = async (channelId: string) =>
    owner.integrations.create({ channelId, kind: 'messenger', name: 'Website', config: {} });

  return {
    owner,
    teammate,
    ours,
    other,
    inOurs: await messenger(ours.id),
    inOther: await messenger(other.id),
  };
};

type Seeded = Awaited<ReturnType<typeof setUp>>;

/** A conversation in the channel of `integration`, started at `createdAt`. */
const conversation = (
  orgId: string,
  integration: Seeded['inOurs'],
  values: Partial<typeof conversations.$inferInsert> & { createdAt: Date },
) =>
  withOrg(orgId, async (tx) => {
    const [row] = await tx
      .insert(conversations)
      .values({
        orgId,
        channelId: integration.channelId,
        integrationId: integration.id,
        customerId: 'customer-1',
        ...values,
      })
      .returning({ id: conversations.id });

    return row?.id ?? '';
  });

describe('conversation report', () => {
  it('counts the conversations of the member’s channels by their own days, sources, tags and repliers', async () => {
    const orgId = 'org-rp-conversations';
    const { owner, teammate, inOurs, inOther } = await setUp(orgId);
    const refund = await owner.tags.create({ type: 'conversation', name: 'Refund' });

    const firstStart = at('2026-03-01T01:00:00Z');

    const first = await conversation(orgId, inOurs, {
      createdAt: firstStart,
      status: 'resolved',
      firstRespondedAt: seconds(firstStart, 120),
      resolvedAt: seconds(firstStart, 86_400),
    });

    // 04:00 on 2 March in Ulaanbaatar.
    const secondStart = at('2026-03-01T20:00:00Z');

    const second = await conversation(orgId, inOurs, {
      createdAt: secondStart,
      status: 'open',
      firstRespondedAt: seconds(secondStart, 60),
    });

    await conversation(orgId, inOurs, { createdAt: at('2026-02-20T01:00:00Z') });
    await conversation(orgId, inOther, { createdAt: at('2026-03-02T01:00:00Z') });

    await withOrg(orgId, async (tx) => {
      await tx.insert(conversationTags).values({ orgId, conversationId: first, tagId: refund.id });
      await tx.insert(messages).values([
        { orgId, conversationId: first, userId: 'teammate', createdAt: seconds(firstStart, 120) },
        { orgId, conversationId: first, userId: 'teammate', createdAt: seconds(firstStart, 600) },
        { orgId, conversationId: second, userId: 'teammate', createdAt: seconds(secondStart, 60) },
        {
          orgId,
          conversationId: second,
          userId: 'teammate',
          internal: true,
          createdAt: secondStart,
        },
        { orgId, conversationId: second, customerId: 'customer-1', createdAt: secondStart },
      ]);
    });

    expect(await teammate.reports.conversations(PERIOD)).toEqual({
      started: 2,
      resolved: 1,
      unresolved: 2,
      firstResponseSeconds: 90,
      resolutionSeconds: 86_400,
      days: [
        { day: '2026-03-01', started: 1, resolved: 0 },
        { day: '2026-03-02', started: 1, resolved: 1 },
        { day: '2026-03-03', started: 0, resolved: 0 },
      ],
      sources: [{ kind: 'messenger', count: 2 }],
      tags: [{ tagId: refund.id, name: 'Refund', colorCode: null, count: 1 }],
      members: [{ userId: 'teammate', replies: 3, conversations: 2 }],
    });

    // One who manages every channel sees the other channel's conversation too.
    await expect(owner.reports.conversations(PERIOD)).resolves.toMatchObject({ started: 3 });

    await expect(clientAs('org-rp-elsewhere').reports.conversations(PERIOD)).resolves.toMatchObject(
      { started: 0, unresolved: 0, sources: [], members: [] },
    );
  });

  it('refuses a period that ends before it starts, or an unknown time zone', async () => {
    const owner = clientAs('org-rp-input');

    await expect(
      owner.reports.conversations({ ...PERIOD, from: PERIOD.to, to: PERIOD.from }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      owner.reports.conversations({ ...PERIOD, timeZone: 'Mars/Olympus' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('ticket report', () => {
  it('counts the period’s tickets by day, stage, priority and tag, and what is overdue now', async () => {
    const orgId = 'org-rp-tickets';
    const { owner, teammate, ours, other } = await setUp(orgId);
    const pipeline = await owner.pipelines.create({ channelId: ours.id, name: 'Main' });
    const elsewhere = await owner.pipelines.create({ channelId: other.id, name: 'Leads' });
    const statuses = await owner.pipelines.statuses.list({ pipelineId: pipeline.id });
    const resolvedStatus = statuses.find((status) => status.type === 4)?.id ?? '';
    const bug = await owner.tags.create({ type: 'ticket', name: 'Bug' });

    const outage = await owner.tickets.create({
      pipelineId: pipeline.id,
      name: 'Outage',
      priority: 4,
      tagIds: [bug.id],
    });

    await owner.tickets.update({ id: outage.id, statusId: resolvedStatus });

    const question = await owner.tickets.create({ pipelineId: pipeline.id, name: 'Question' });
    const old = await owner.tickets.create({ pipelineId: pipeline.id, name: 'Old' });
    const hidden = await owner.tickets.create({ pipelineId: elsewhere.id, name: 'Hidden' });

    await withOrg(orgId, async (tx) => {
      const move = (ids: string[], values: Partial<typeof tickets.$inferInsert>) =>
        tx.update(tickets).set(values).where(inArray(tickets.id, ids));

      await move([outage.id], {
        createdAt: at('2026-03-01T02:00:00Z'),
        resolvedAt: at('2026-03-01T05:00:00Z'),
      });
      await move([question.id, hidden.id], {
        createdAt: at('2026-03-02T02:00:00Z'),
        resolutionDueAt: at('2026-03-02T03:00:00Z'),
      });
      await move([old.id], { createdAt: at('2026-02-01T02:00:00Z') });
    });

    const report = await teammate.reports.tickets(PERIOD);

    expect(report.statuses.toSorted((a, b) => a.statusId.localeCompare(b.statusId))).toEqual(
      [
        { statusId: resolvedStatus, count: 1 },
        { statusId: question.statusId, count: 1 },
      ].toSorted((a, b) => a.statusId.localeCompare(b.statusId)),
    );
    expect({ ...report, statuses: [] }).toEqual({
      created: 2,
      resolved: 1,
      unresolved: 2,
      overdue: 1,
      resolutionSeconds: 10_800,
      days: [
        { day: '2026-03-01', created: 1, resolved: 1 },
        { day: '2026-03-02', created: 1, resolved: 0 },
        { day: '2026-03-03', created: 0, resolved: 0 },
      ],
      stages: [
        { type: 1, count: 1 },
        { type: 4, count: 1 },
      ],
      priorities: [
        { priority: 4, count: 1 },
        { priority: 0, count: 1 },
      ],
      tags: [{ tagId: bug.id, name: 'Bug', colorCode: null, count: 1 }],
      statuses: [],
      sla: [{ clock: 'resolution', state: 'overdue', count: 1 }],
      assignees: [{ userId: null, count: 2 }],
    });

    await expect(owner.reports.tickets(PERIOD)).resolves.toMatchObject({ created: 3, overdue: 2 });
    // A tile picks one pipeline.
    await expect(
      owner.reports.tickets({ ...PERIOD, pipelineId: elsewhere.id }),
    ).resolves.toMatchObject({ created: 1, statuses: [{ count: 1 }] });
    await expect(
      teammate.reports.tickets({ ...PERIOD, pipelineId: elsewhere.id }),
    ).resolves.toMatchObject({ created: 0, assignees: [] });
  });
});

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
        call('k3', monday, { queue: '6502', status: 'missed', customerPhone: '88000000' }),
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

    expect(await teammate.reports.calls(PERIOD)).toEqual({
      total: 4,
      incoming: 3,
      outgoing: 1,
      answered: 3,
      missed: 1,
      waitSeconds: 20,
      talkSeconds: 70,
      serviceLevel: 1 / 3,
      serviceLevelSeconds: 20,
      days: [
        { day: '2026-03-01', incoming: 2, outgoing: 0, answered: 2, missed: 0 },
        { day: '2026-03-02', incoming: 1, outgoing: 1, answered: 1, missed: 1 },
        { day: '2026-03-03', incoming: 0, outgoing: 0, answered: 0, missed: 0 },
      ],
      hours: [
        { weekday: 1, hour: 10, total: 1, answered: 0 },
        { weekday: 1, hour: 11, total: 1, answered: 1 },
        { weekday: 7, hour: 10, total: 1, answered: 1 },
        { weekday: 7, hour: 11, total: 1, answered: 1 },
      ],
      agents: [{ userId: 'teammate', answered: 3, talkSeconds: 210 }],
      numbers: [
        { customerPhone: '88000000', total: 2, answered: 1, missed: 1 },
        { customerPhone: '99110000', total: 2, answered: 2, missed: 0 },
      ],
      queues: [
        { queue: '6501', total: 2, answered: 2, missed: 0, waitSeconds: 20, talkSeconds: 90 },
        { queue: '6502', total: 1, answered: 0, missed: 1, waitSeconds: null, talkSeconds: null },
      ],
      calledBack: 1,
      reached: 1,
      callbackSeconds: 3600,
      callbackHours: 24,
    });

    await expect(owner.reports.calls(PERIOD)).resolves.toMatchObject({ total: 5 });

    // A call older than the period still counts once it falls in a longer one.
    await expect(
      teammate.reports.calls({ ...PERIOD, from: at('2026-02-01T00:00:00Z') }),
    ).resolves.toMatchObject({ total: 5 });
  });
});
