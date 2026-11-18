import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';
import { tokenOf } from '../../messenger/session.ts';

const agent = [PERMISSIONS.channelView];

const messenger = serve('/api/public/messenger');

/** An organisation's owner, a channel with `teammate` in it, and a pipeline with its statuses by stage. */
const setUp = async (orgId: string) => {
  const owner = clientAs(orgId);
  const channel = await owner.channels.create({ name: 'Support', memberIds: ['teammate'] });
  const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Main' });
  const statuses = await owner.pipelines.statuses.list({ pipelineId: pipeline.id });
  const stage = (type: number) => statuses.find((status) => status.type === type)?.id ?? '';

  return { owner, teammate: clientAs(orgId, agent, 'teammate'), channel, pipeline, stage };
};

const year = new Date().getUTCFullYear();

/** Minutes from `from` to `to`, or null without `to`. */
const minutes = (from: Date, to: Date | null) =>
  to ? (to.getTime() - from.getTime()) / 60_000 : null;

/** The filter bar's one rule, as `useListFilterParams()` sends it. */
const rule = (path: string, op: string, value?: unknown) =>
  JSON.stringify({ match: 'all', rules: [{ path: `subject.${path}`, op, value }] });

describe('tickets', () => {
  it('numbers tickets per pipeline, at once without repeats', async () => {
    const { owner, channel, pipeline } = await setUp('org-tk-a');

    await owner.pipelines.update({ id: pipeline.id, numberConfig: 'RT-{year}-', numberSize: 3 });

    const first = await owner.tickets.create({ pipelineId: pipeline.id, name: 'Refund' });

    expect(first).toMatchObject({
      channelId: channel.id,
      number: `RT-${year}-000`,
      priority: 0,
      state: 'active',
      createdBy: 'user-org-tk-a',
      canManage: true,
      firstResponseSla: null,
    });
    expect(first).not.toHaveProperty('orgId');

    const many = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        owner.tickets.create({ pipelineId: pipeline.id, name: `Ticket ${index}` }),
      ),
    );

    expect(new Set(many.map((ticket) => ticket.number)).size).toBe(8);
    expect(many.map((ticket) => ticket.number)).toContain(`RT-${year}-008`);

    const other = await owner.pipelines.create({ channelId: channel.id, name: 'Other' });

    await expect(
      owner.tickets.create({ pipelineId: other.id, name: 'Unnumbered' }),
    ).resolves.toMatchObject({ number: null });
  });

  it('sets SLA due times from the priority and stamps the response and resolution', async () => {
    const { owner, pipeline, stage } = await setUp('org-tk-b');

    await owner.pipelines.update({
      id: pipeline.id,
      slaPolicy: {
        enabled: true,
        rules: [
          { priority: 4, firstResponseMinutes: 30, resolutionMinutes: 240 },
          { priority: 1, resolutionMinutes: 2880 },
        ],
      },
    });

    const ticket = await owner.tickets.create({
      pipelineId: pipeline.id,
      name: 'Outage',
      priority: 4,
    });

    expect(ticket).toMatchObject({
      statusId: stage(1),
      firstResponseSla: 'due',
      resolutionSla: 'due',
    });
    expect(minutes(ticket.createdAt, ticket.firstResponseDueAt)).toBe(30);
    expect(minutes(ticket.createdAt, ticket.resolutionDueAt)).toBe(240);

    const lower = await owner.tickets.update({ id: ticket.id, priority: 1 });

    expect(lower.firstResponseDueAt).toBeNull();
    expect(minutes(ticket.createdAt, lower.resolutionDueAt)).toBe(2880);
    expect(lower.firstRespondedAt).toBeNull();

    const resolved = await owner.tickets.update({ id: ticket.id, statusId: stage(4) });

    expect(resolved).toMatchObject({ statusChangedBy: 'user-org-tk-b', resolutionSla: 'met' });
    expect(resolved.firstRespondedAt).toBeInstanceOf(Date);
    expect(resolved.resolvedAt).toBeInstanceOf(Date);

    const reopened = await owner.tickets.update({ id: ticket.id, statusId: stage(2) });

    expect(reopened.resolvedAt).toBeNull();
    expect(reopened.firstRespondedAt).toEqual(resolved.firstRespondedAt);
  });

  it('lists by the filter bar, newest first a page at a time with the total, for the channel only', async () => {
    const { owner, teammate, channel, pipeline, stage } = await setUp('org-tk-c');

    for (const name of ['Login fails', 'Refund', 'Invoice copy']) {
      await owner.tickets.create({ pipelineId: pipeline.id, name });
    }

    const refund = (await owner.tickets.list({ search: 'refu' })).tickets[0];

    await owner.tickets.update({ id: refund?.id ?? '', assigneeId: 'teammate', priority: 3 });
    await owner.tickets.update({ id: refund?.id ?? '', statusId: stage(3) });

    const page = await teammate.tickets.list({ limit: 2 });

    expect(page.totalCount).toBe(3);
    expect(page.tickets.map((ticket) => ticket.name)).toEqual(['Refund', 'Invoice copy']);
    expect(page.tickets[0]?.canManage).toBe(false);
    await expect(
      teammate.tickets.list({ limit: 2, cursor: page.nextCursor ?? '' }),
    ).resolves.toMatchObject({ tickets: [{ name: 'Login fails' }], nextCursor: null });

    const names = async (input: Parameters<typeof owner.tickets.list>[0]) =>
      (await owner.tickets.list(input)).tickets.map((ticket) => ticket.name);

    await expect(names({ sort: 'createdAt', ascending: true })).resolves.toEqual([
      'Login fails',
      'Refund',
      'Invoice copy',
    ]);
    await expect(names({ filter: rule('assigneeId', 'eq', 'teammate') })).resolves.toEqual([
      'Refund',
    ]);
    await expect(names({ filter: rule('assigneeId', 'not_exists') })).resolves.toHaveLength(2);
    await expect(names({ filter: rule('channelId', 'eq', channel.id) })).resolves.toHaveLength(3);
    await expect(names({ pipelineId: pipeline.id })).resolves.toHaveLength(3);
    await expect(names({ pipelineId: 'other' })).resolves.toEqual([]);
    await expect(names({ filter: rule('priority', 'in', ['3', '4']) })).resolves.toEqual([
      'Refund',
    ]);
    await expect(names({ filter: rule('statusId', 'eq', stage(3)) })).resolves.toEqual(['Refund']);
    await expect(names({ filter: rule('number', 'exists') })).resolves.toEqual([]);
    await expect(names({ filter: rule('firstResponseSla', 'eq', 'due') })).resolves.toEqual([]);
    await expect(
      names({ filter: rule('createdAt', 'within_last', { amount: 1, unit: 'days' }) }),
    ).resolves.toHaveLength(3);
    await expect(names({ filter: rule('orgId', 'eq', 'x') })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });

    await owner.tickets.bulkUpdate({ ids: [refund?.id ?? ''], state: 'archived' });
    await expect(names({ filter: rule('state', 'eq', 'archived') })).resolves.toEqual(['Refund']);
    await expect(names({})).resolves.toHaveLength(2);

    const outsider = clientAs('org-tk-c', agent, 'outsider');

    await expect(outsider.tickets.list({})).resolves.toMatchObject({ tickets: [], totalCount: 0 });
    await expect(outsider.tickets.get({ id: refund?.id ?? '' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(clientAs('org-tk-other').tickets.list({})).resolves.toMatchObject({
      totalCount: 0,
    });
  });

  it('changes a selection in one transaction, all of it or none', async () => {
    const { owner, teammate, channel, pipeline, stage } = await setUp('org-tk-d');
    const target = await owner.pipelines.create({ channelId: channel.id, name: 'Escalations' });

    await owner.pipelines.update({ id: target.id, numberConfig: 'E', numberSize: 2 });

    const a = await owner.tickets.create({ pipelineId: pipeline.id, name: 'A' });
    const b = await owner.tickets.create({ pipelineId: pipeline.id, name: 'B' });

    await owner.tickets.update({ id: b.id, statusId: stage(3) });

    await expect(
      teammate.tickets.bulkUpdate({ ids: [a.id, b.id], assigneeId: 'teammate', priority: 2 }),
    ).resolves.toMatchObject([
      { assigneeId: 'teammate', priority: 2 },
      { assigneeId: 'teammate', priority: 2 },
    ]);

    await expect(
      teammate.tickets.bulkUpdate({ ids: [a.id, 'missing'], priority: 4 }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(owner.tickets.get({ id: a.id })).resolves.toMatchObject({ priority: 2 });

    const targetStatuses = await owner.pipelines.statuses.list({ pipelineId: target.id });

    await expect(
      teammate.tickets.bulkUpdate({ ids: [a.id], statusId: targetStatuses[0]?.id ?? '' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const moved = await teammate.tickets.bulkUpdate({ ids: [a.id, b.id], pipelineId: target.id });
    const typeOf = (id: string) => targetStatuses.find((status) => status.id === id)?.type;

    expect(
      moved.map((ticket) => [ticket.pipelineId, typeOf(ticket.statusId), ticket.number]),
    ).toEqual([
      [target.id, 1, 'E00'],
      [target.id, 3, 'E01'],
    ]);

    await expect(teammate.tickets.bulkRemove({ ids: [a.id, b.id] })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(owner.pipelines.remove({ ids: [target.id] })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await expect(
      owner.pipelines.statuses.remove({ ids: [targetStatuses[0]?.id ?? ''] }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    await expect(owner.tickets.bulkRemove({ ids: [a.id, b.id] })).resolves.toEqual({
      ids: [a.id, b.id],
    });
    await expect(owner.pipelines.remove({ ids: [target.id] })).resolves.toEqual({
      ids: [target.id],
    });
  });

  it('takes tickets along when their pipeline moves to another channel', async () => {
    const { owner, pipeline } = await setUp('org-tk-e');
    const billing = await owner.channels.create({ name: 'Billing' });
    const ticket = await owner.tickets.create({ pipelineId: pipeline.id, name: 'Moves' });

    await owner.pipelines.update({ id: pipeline.id, channelId: billing.id });

    await expect(owner.tickets.get({ id: ticket.id })).resolves.toMatchObject({
      channelId: billing.id,
    });
    await owner.channels.remove({ ids: [billing.id] });
    await expect(owner.tickets.get({ id: ticket.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it("publishes each change to the ticket's timeline, only when it commits", async () => {
    const { owner, teammate, pipeline, stage } = await setUp('org-tk-g');
    const ticket = await owner.tickets.create({ pipelineId: pipeline.id, name: 'Login' });

    await teammate.tickets.update({ id: ticket.id, name: 'Login loop', priority: 3 });
    await teammate.tickets.update({ id: ticket.id, statusId: stage(2) });
    await teammate.tickets.bulkUpdate({ ids: [ticket.id], assigneeId: 'teammate' });
    await teammate.tickets.update({ id: ticket.id, priority: 3 });
    await expect(
      teammate.tickets.bulkUpdate({ ids: [ticket.id, 'missing'], state: 'archived' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const timeline = await withOrg('org-tk-g', async (tx) =>
      tx.execute<{ type: string; summary: string; actor_id: string; payload: unknown }>(
        sql`select type, summary, actor_id, payload from core_events
            where entity_type = 'frontline.ticket' and entity_id = ${ticket.id} order by seq`,
      ),
    );

    expect(timeline.rows).toMatchObject([
      {
        type: 'frontline.ticket.created',
        summary: 'Created Login in New',
        actor_id: 'user-org-tk-g',
      },
      {
        type: 'frontline.ticket.fields_changed',
        summary: 'Changed name, priority',
        actor_id: 'teammate',
        payload: { fields: ['name', 'priority'], before: { name: 'Login', priority: 0 } },
      },
      { type: 'frontline.ticket.moved', summary: 'Moved from New to Open' },
      { type: 'frontline.ticket.assigned', payload: { toAssigneeId: 'teammate' } },
    ]);
    expect(timeline.rows).toHaveLength(4);
  });

  it('lists the pipelines and statuses a ticket can be filed under', async () => {
    const { owner, teammate, pipeline } = await setUp('org-tk-f');
    const hidden = await owner.channels.create({ name: 'Hidden' });

    await owner.pipelines.create({ channelId: hidden.id, name: 'Secret' });

    const choices = await teammate.pipelines.choices();

    expect(choices.pipelines.map((row) => row.name)).toEqual(['Main']);
    expect(choices.statuses).toHaveLength(6);
    expect(choices.statuses.every((status) => status.pipelineId === pipeline.id)).toBe(true);
    await expect(owner.pipelines.choices()).resolves.toMatchObject({
      pipelines: [{ name: 'Main' }, { name: 'Secret' }],
    });
  });

  it('lets a messenger visitor file tickets in the pipelines it offers and follow only theirs', async () => {
    const { owner, channel, pipeline } = await setUp('org-tk-visitor');
    const elsewhere = await owner.channels.create({ name: 'Sales' });
    const foreign = await owner.pipelines.create({ channelId: elsewhere.id, name: 'Leads' });
    const size = await owner.tickets.properties.create({ label: 'Size', type: 'text' });
    const tag = await owner.tags.create({ type: 'ticket', name: 'Shipping' });

    const integration = await owner.integrations.create({
      channelId: channel.id,
      kind: 'messenger',
      name: 'Website',
      config: { ticketPipelineIds: [pipeline.id, foreign.id] },
    });

    const visitor = { orgId: 'org-tk-visitor', integrationId: integration.id, verified: false };
    const ann = await tokenOf({ ...visitor, customerId: 'customer-ann', identified: true });
    const anonymous = await tokenOf({ ...visitor, customerId: 'customer-bob', identified: false });
    const file = { pipelineId: pipeline.id, name: 'Broken zip', tagIds: [tag.id] };

    // Only the pipeline of the messenger's own channel is offered.
    expect((await messenger.get('/tickets/forms', ann)).body).toEqual({
      pipelines: [
        { id: pipeline.id, name: 'Main', properties: [expect.objectContaining({ id: size.id })] },
      ],
      tags: [{ id: tag.id, name: 'Shipping', colorCode: null }],
    });
    expect((await messenger.post('/tickets', file, anonymous)).status).toBe(403);
    expect(
      (await messenger.post('/tickets', { ...file, pipelineId: foreign.id }, ann)).status,
    ).toBe(400);

    const filed = await messenger.post(
      '/tickets',
      { ...file, propertiesData: { [size.id]: 'XL' } },
      ann,
    );

    expect(filed).toMatchObject({ status: 201, body: { name: 'Broken zip', status: 'New' } });
    expect(await owner.tickets.list({})).toMatchObject({
      tickets: [{ customerId: 'customer-ann', createdBy: null, tagIds: [tag.id] }],
    });
    expect((await messenger.get('/tickets', ann)).body).toEqual([
      expect.objectContaining({ name: 'Broken zip', pipeline: 'Main' }),
    ]);
    expect((await messenger.get('/tickets', anonymous)).body).toEqual([]);
  });
});
