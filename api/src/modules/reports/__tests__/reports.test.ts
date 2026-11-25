import { inArray } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { withOrg } from '#/db/client.ts';
import { conversationTags, messages } from '#/db/inbox.ts';
import { tickets } from '#/db/tickets.ts';
import { only } from '#/test/filter.ts';
import { clientAs } from '#/test/member.ts';
import { at, conversation, PERIOD, seconds, setUp } from '#/test/reports.ts';

// Core checks a new ticket's fields.
vi.mock('#/core.ts', async (importOriginal) =>
  (await import('#/test/coreUnits.ts')).unitsStandIn(await importOriginal()),
);

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
        // Replies that ended a customer's wait keep how long it was, and whether by the target.
        {
          orgId,
          conversationId: first,
          userId: 'teammate',
          createdAt: seconds(firstStart, 120),
          waitedSeconds: 120,
          replyOnTime: true,
        },
        { orgId, conversationId: first, userId: 'teammate', createdAt: seconds(firstStart, 600) },
        {
          orgId,
          conversationId: second,
          userId: 'teammate',
          createdAt: seconds(secondStart, 60),
          waitedSeconds: 60,
          replyOnTime: false,
        },
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
      replySeconds: 90,
      replies: { withTarget: 2, onTime: 1 },
      overdue: 0,
      days: [
        { day: '2026-03-01', started: 1, resolved: 0 },
        { day: '2026-03-02', started: 1, resolved: 1 },
        { day: '2026-03-03', started: 0, resolved: 0 },
      ],
      sources: [{ kind: 'messenger', count: 2 }],
      tags: [{ tagId: refund.id, name: 'Refund', colorCode: null, count: 1 }],
      members: [{ userId: 'teammate', replies: 3, conversations: 2, replySeconds: 90 }],
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
    // A card's filter keeps one pipeline.
    await expect(
      owner.reports.tickets({ ...PERIOD, filter: only('subject.pipelineId', elsewhere.id) }),
    ).resolves.toMatchObject({ created: 1, statuses: [{ count: 1 }] });
    await expect(
      teammate.reports.tickets({ ...PERIOD, filter: only('subject.pipelineId', elsewhere.id) }),
    ).resolves.toMatchObject({ created: 0, assignees: [] });
  });
});
