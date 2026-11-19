import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';

const FILTER = {
  match: 'all' as const,
  rules: [{ path: 'subject.kind', op: 'in' as const, value: ['messenger'] }],
};

describe('saved report charts', () => {
  it('saves a card with its filter and look, which every member sees, changes it and takes it off', async () => {
    const orgId = 'org-charts';
    const owner = clientAs(orgId);
    const teammate = clientAs(orgId, [PERMISSIONS.channelView], 'teammate');

    const chart = await owner.reports.charts.create({
      name: 'Website sources',
      section: 'conversations',
      kind: 'conversations-by-source',
      visual: 'pie',
      period: '90',
      filter: FILTER,
    });

    expect(chart).toMatchObject({
      name: 'Website sources',
      kind: 'conversations-by-source',
      visual: 'pie',
      period: '90',
      filter: FILTER,
      from: null,
      fieldId: null,
      createdBy: 'user-org-charts',
    });

    await expect(teammate.reports.charts.list({ section: 'conversations' })).resolves.toEqual([
      chart,
    ]);
    await expect(teammate.reports.charts.list({ section: 'tickets' })).resolves.toEqual([]);

    const from = new Date('2026-03-01T00:00:00Z');
    const to = new Date('2026-03-08T00:00:00Z');

    await expect(
      teammate.reports.charts.update({ id: chart.id, name: 'Sources', period: 'custom', from, to }),
    ).resolves.toMatchObject({
      name: 'Sources',
      visual: 'pie',
      period: 'custom',
      from,
      to,
      filter: FILTER,
    });

    await expect(teammate.reports.charts.remove({ id: chart.id })).resolves.toEqual({
      id: chart.id,
    });
    await expect(owner.reports.charts.list({ section: 'conversations' })).resolves.toEqual([]);
  });

  it('refuses a custom period without its bounds, in order', async () => {
    const owner = clientAs('org-charts-period');

    const base = {
      name: 'Calls',
      section: 'calls' as const,
      kind: 'call-volume',
      visual: 'bar' as const,
    };

    await expect(
      owner.reports.charts.create({ ...base, period: 'custom', from: new Date() }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const chart = await owner.reports.charts.create({ ...base, period: '7' });

    await expect(
      owner.reports.charts.update({
        id: chart.id,
        period: 'custom',
        from: new Date('2026-03-08T00:00:00Z'),
        to: new Date('2026-03-01T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('keeps each organisation’s charts to itself, and refuses a member who may not use Frontline', async () => {
    const owner = clientAs('org-charts-ours');
    const outsider = clientAs('org-charts-theirs');

    const chart = await owner.reports.charts.create({
      name: 'Tickets',
      section: 'tickets',
      kind: 'tickets-over-time',
      visual: 'line',
      period: '30',
    });

    await expect(outsider.reports.charts.list({ section: 'tickets' })).resolves.toEqual([]);
    await expect(
      outsider.reports.charts.update({ id: chart.id, name: 'Mine' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(outsider.reports.charts.remove({ id: chart.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    await expect(
      clientAs('org-charts-ours', [], 'nobody').reports.charts.list({ section: 'tickets' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
