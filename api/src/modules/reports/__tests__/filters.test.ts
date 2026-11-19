import { eq } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { withOrg } from '#/db/client.ts';
import { conversations } from '#/db/inbox.ts';
import { tickets } from '#/db/tickets.ts';
import { only } from '#/test/filter.ts';
import { clientAs } from '#/test/member.ts';

// Core checks a new ticket's fields.
vi.mock('#/core.ts', async (importOriginal) =>
  (await import('#/test/coreUnits.ts')).unitsStandIn(await importOriginal()),
);

/** 1 to 3 March 2026 in Ulaanbaatar. */
const PERIOD = {
  from: new Date('2026-03-01T00:00:00+08:00'),
  to: new Date('2026-03-04T00:00:00+08:00'),
  timeZone: 'Asia/Ulaanbaatar',
};

const IN_PERIOD = new Date('2026-03-02T02:00:00Z');

describe('a report card’s filter', () => {
  it('narrows a report as it narrows the list of the same records', async () => {
    const orgId = 'org-rf-conversations';
    const owner = clientAs(orgId);
    const channel = await owner.channels.create({ name: 'Support' });

    const messenger = await owner.integrations.create({
      channelId: channel.id,
      kind: 'messenger',
      name: 'Website',
      config: {},
    });

    await withOrg(orgId, (tx) =>
      tx.insert(conversations).values(
        ['teammate', null, null].map((assigneeId) => ({
          orgId,
          channelId: channel.id,
          integrationId: messenger.id,
          customerId: 'customer-1',
          assigneeId,
          createdAt: IN_PERIOD,
        })),
      ),
    );

    const theirs = only('subject.assigneeId', 'teammate');

    await expect(owner.reports.conversations(PERIOD)).resolves.toMatchObject({ started: 3 });
    await expect(owner.reports.conversations({ ...PERIOD, filter: theirs })).resolves.toMatchObject(
      { started: 1, unresolved: 1 },
    );
    await expect(owner.conversations.list({ filter: theirs })).resolves.toMatchObject({
      totalCount: 1,
    });

    // The source is a field of the inbox's filter too.
    await expect(
      owner.reports.conversations({ ...PERIOD, filter: only('subject.kind', 'facebook') }),
    ).resolves.toMatchObject({ started: 0 });
  });

  it('refuses a rule on a field the list has no column for', async () => {
    const owner = clientAs('org-rf-unknown');

    await expect(
      owner.reports.calls({ ...PERIOD, filter: only('subject.nothing', 'x') }),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('tickets by property', () => {
  it('counts the period’s tickets by a custom field’s values, each option of a multi-pick apart', async () => {
    const orgId = 'org-rf-properties';
    const owner = clientAs(orgId);
    const channel = await owner.channels.create({ name: 'Support' });
    const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Main' });

    const values: (typeof tickets.$inferInsert)['propertiesData'][] = [
      { colour: 'red' },
      { colour: ['red', 'blue'] },
      { colour: '' },
      { size: 'large' },
      { colour: 'green' },
    ];

    for (const [index, propertiesData] of values.entries()) {
      const { id } = await owner.tickets.create({ pipelineId: pipeline.id, name: `T${index}` });

      // The last one came before the period.
      const createdAt = index === values.length - 1 ? new Date('2026-02-01T00:00:00Z') : IN_PERIOD;

      await withOrg(orgId, (tx) =>
        tx.update(tickets).set({ propertiesData, createdAt }).where(eq(tickets.id, id)),
      );
    }

    await expect(owner.reports.ticketProperties({ ...PERIOD, fieldId: 'colour' })).resolves.toEqual(
      [
        { value: 'red', count: 2 },
        { value: 'blue', count: 1 },
      ],
    );

    await expect(
      clientAs('org-rf-elsewhere').reports.ticketProperties({ ...PERIOD, fieldId: 'colour' }),
    ).resolves.toEqual([]);
  });
});
