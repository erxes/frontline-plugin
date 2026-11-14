import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';

describe('pipelines', () => {
  it('creates a pipeline with a status per stage, edits it, moves it and deletes it', async () => {
    const owner = clientAs('org-pl-a');
    const support = await owner.channels.create({ name: 'Support' });
    const billing = await owner.channels.create({ name: 'Billing' });

    const pipeline = await owner.pipelines.create({ channelId: support.id, name: 'Complaints' });

    expect(pipeline).toMatchObject({
      channelId: support.id,
      description: null,
      numberSize: null,
      slaPolicy: null,
      createdBy: 'user-org-pl-a',
    });
    expect(pipeline).not.toHaveProperty('orgId');

    const statuses = await owner.pipelines.statuses.list({ pipelineId: pipeline.id });

    expect(statuses.map((status) => [status.type, status.name])).toEqual([
      [1, 'New'],
      [2, 'Open'],
      [3, 'In progress'],
      [4, 'Resolved'],
      [5, 'Closed'],
      [6, 'Cancelled'],
    ]);

    await expect(
      owner.pipelines.update({
        id: pipeline.id,
        description: '  ',
        numberConfig: 'C{year}-',
        numberSize: 4,
        nameConfig: '{customer.firstName}',
      }),
    ).resolves.toMatchObject({ description: null, numberConfig: 'C{year}-', numberSize: 4 });
    await expect(owner.pipelines.update({ id: pipeline.id, numberSize: 9 })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });

    await expect(
      owner.pipelines.update({ id: pipeline.id, channelId: billing.id }),
    ).resolves.toMatchObject({ channelId: billing.id, numberConfig: 'C{year}-' });
    await expect(owner.pipelines.list({ channelId: support.id })).resolves.toMatchObject({
      pipelines: [],
      totalCount: 0,
    });

    await expect(owner.pipelines.remove({ id: pipeline.id })).resolves.toEqual({
      id: pipeline.id,
    });
    await expect(owner.pipelines.get({ id: pipeline.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      owner.pipelines.statuses.update({ id: statuses[0]?.id ?? '', name: 'Gone' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps one SLA rule per priority and drops rules without a clock', async () => {
    const owner = clientAs('org-pl-b');
    const channel = await owner.channels.create({ name: 'Support' });
    const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Main' });

    await expect(
      owner.pipelines.update({
        id: pipeline.id,
        slaPolicy: {
          enabled: true,
          warnBeforeMinutes: 30,
          rules: [
            { priority: 4, firstResponseMinutes: 60, resolutionMinutes: 480 },
            { priority: 1 },
          ],
        },
      }),
    ).resolves.toMatchObject({
      slaPolicy: {
        enabled: true,
        warnBeforeMinutes: 30,
        rules: [{ priority: 4, firstResponseMinutes: 60, resolutionMinutes: 480 }],
      },
    });

    await expect(
      owner.pipelines.update({
        id: pipeline.id,
        slaPolicy: {
          enabled: true,
          rules: [
            { priority: 2, resolutionMinutes: 60 },
            { priority: 2, resolutionMinutes: 90 },
          ],
        },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('pages a channel newest first and counts every pipeline', async () => {
    const owner = clientAs('org-pl-c');
    const channel = await owner.channels.create({ name: 'Sales' });

    for (const name of ['First', 'Second', 'Third'])
      await owner.pipelines.create({ channelId: channel.id, name });

    const first = await owner.pipelines.list({ channelId: channel.id, limit: 2 });

    expect(first.totalCount).toBe(3);
    expect(first.pipelines.map((pipeline) => pipeline.name)).toEqual(['Third', 'Second']);

    const rest = await owner.pipelines.list({
      channelId: channel.id,
      limit: 2,
      cursor: first.nextCursor ?? undefined,
    });

    expect(rest.pipelines.map((pipeline) => pipeline.name)).toEqual(['First']);
    expect(rest.nextCursor).toBeNull();
  });

  it('adds statuses last in their stage, even at once, and reorders a stage in one call', async () => {
    const owner = clientAs('org-pl-d');
    const channel = await owner.channels.create({ name: 'Support' });
    const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Main' });
    const pipelineId = pipeline.id;

    const added = await Promise.all(
      ['Waiting', 'Escalated', 'On hold'].map((name) =>
        owner.pipelines.statuses.create({ pipelineId, type: 3, name, color: '#123abc' }),
      ),
    );

    expect(added.map((status) => status.order).toSorted((a, b) => a - b)).toEqual([1, 2, 3]);

    const stage = async () =>
      (await owner.pipelines.statuses.list({ pipelineId }))
        .filter((status) => status.type === 3)
        .map((status) => status.id);

    const ids = (await stage()).toReversed();

    expect(ids).toHaveLength(4);
    await expect(
      owner.pipelines.statuses.reorder({ pipelineId, type: 3, ids }),
    ).resolves.toMatchObject(ids.map((id, order) => ({ id, order })));
    await expect(stage()).resolves.toEqual(ids);

    // A stale list leaves a status out: the stage keeps its order.
    await expect(
      owner.pipelines.statuses.reorder({ pipelineId, type: 3, ids: ids.slice(1) }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const [first] = added;

    await expect(
      owner.pipelines.statuses.update({ id: first?.id ?? '', name: 'Paused', description: '' }),
    ).resolves.toMatchObject({ name: 'Paused', description: null, color: '#123abc' });
    await expect(owner.pipelines.statuses.remove({ id: first?.id ?? '' })).resolves.toEqual({
      id: first?.id,
    });
    await expect(stage()).resolves.toHaveLength(3);
  });

  it('lets channel members read pipelines and only admins change them', async () => {
    const owner = clientAs('org-pl-e');
    const joined = await owner.channels.create({ name: 'Joined' });
    const other = await owner.channels.create({ name: 'Other' });
    const pipeline = await owner.pipelines.create({ channelId: joined.id, name: 'Main' });
    const hidden = await owner.pipelines.create({ channelId: other.id, name: 'Secret' });
    const agent = clientAs('org-pl-e', [PERMISSIONS.channelView], 'agent-pl-e');

    await owner.channels.addMembers({ id: joined.id, userIds: ['agent-pl-e'] });

    await expect(agent.pipelines.list({ channelId: joined.id })).resolves.toMatchObject({
      pipelines: [{ id: pipeline.id }],
    });
    await expect(agent.pipelines.statuses.list({ pipelineId: pipeline.id })).resolves.toHaveLength(
      6,
    );
    await expect(agent.pipelines.get({ id: hidden.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      agent.pipelines.update({ id: pipeline.id, name: 'Changed' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      agent.pipelines.create({ channelId: joined.id, name: 'Mine' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      agent.pipelines.statuses.create({ pipelineId: pipeline.id, type: 1, name: 'Mine' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it("doesn't show another organisation's pipelines", async () => {
    const owner = clientAs('org-pl-f');
    const channel = await owner.channels.create({ name: 'Support' });
    const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Main' });

    await expect(clientAs('org-pl-g').pipelines.get({ id: pipeline.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      clientAs('org-pl-g').pipelines.statuses.list({ pipelineId: pipeline.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
