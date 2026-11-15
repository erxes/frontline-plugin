import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { clientAs } from '#/test/member.ts';
import { checkSla } from '../sla.ts';

const agent = [PERMISSIONS.channelView];

/** An owner, a channel with two agents, and a pipeline with its statuses by stage. */
const setUp = async (orgId: string) => {
  const owner = clientAs(orgId);
  const channel = await owner.channels.create({ name: 'Support', memberIds: ['ann', 'bob'] });
  const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Main' });
  const statuses = await owner.pipelines.statuses.list({ pipelineId: pipeline.id });
  const stage = (type: number) => statuses.find((status) => status.type === type)?.id ?? '';

  return {
    owner,
    ann: clientAs(orgId, agent, 'ann'),
    bob: clientAs(orgId, agent, 'bob'),
    pipeline,
    stage,
  };
};

const eventsOf = (orgId: string, ticketId: string) =>
  withOrg(orgId, async (tx) =>
    tx.execute<{
      type: string;
      subject_id: string | null;
      notify: { userIds: string[]; title: string } | null;
    }>(
      sql`select type, subject_id, notify from core_events
          where entity_id = ${ticketId} order by seq`,
    ),
  );

const ids = (rows: { id: string }[]) => rows.map((row) => row.id);

describe('ticket fields', () => {
  it('keeps tags, teams and contacts, refusing ones that do not exist', async () => {
    const { owner, pipeline } = await setUp('org-tf-a');
    const tag = await owner.tags.create({ type: 'ticket', name: 'VIP' });
    const conversationTag = await owner.tags.create({ type: 'conversation', name: 'VIP' });
    const branch = await owner.teams.create({ kind: 'branch', name: 'North' });
    const department = await owner.teams.create({ kind: 'department', name: 'Care' });

    const ticket = await owner.tickets.create({
      pipelineId: pipeline.id,
      name: 'Refund',
      tagIds: [tag.id],
      branchId: branch.id,
      departmentId: department.id,
      customerId: 'cus-1',
      companyId: 'com-1',
    });

    expect(ticket).toMatchObject({
      tagIds: [tag.id],
      branchId: branch.id,
      departmentId: department.id,
      customerId: 'cus-1',
    });

    await expect(
      owner.tickets.update({ id: ticket.id, tagIds: [conversationTag.id] }),
    ).rejects.toThrow('Pick tags of this list');
    await expect(owner.tickets.update({ id: ticket.id, branchId: department.id })).rejects.toThrow(
      'Pick a branch',
    );

    const filter = JSON.stringify({
      match: 'all',
      rules: [{ path: 'subject.tagIds', op: 'in', value: [tag.id] }],
    });

    await owner.tickets.create({ pipelineId: pipeline.id, name: 'Untagged' });

    expect(ids((await owner.tickets.list({ filter })).tickets)).toEqual([ticket.id]);

    await owner.tags.remove({ ids: [tag.id] });
    await owner.teams.remove({ ids: [branch.id] });

    await expect(owner.tickets.get({ id: ticket.id })).resolves.toMatchObject({
      tagIds: [],
      branchId: null,
      departmentId: department.id,
    });

    // The customer's timeline carries the ticket's events too.
    expect((await eventsOf('org-tf-a', ticket.id)).rows[0]).toMatchObject({ subject_id: 'cus-1' });
  });

  it('checks properties by type and pipeline, requires the required ones and merges changes', async () => {
    const { owner, pipeline } = await setUp('org-tf-b');
    const other = await owner.pipelines.create({ channelId: pipeline.channelId, name: 'Other' });

    const size = await owner.tickets.properties.create({
      label: 'Size',
      type: 'select',
      options: ['S', 'M'],
      isRequired: true,
    });

    const seats = await owner.tickets.properties.create({
      label: 'Seats',
      type: 'number',
      pipelineIds: [pipeline.id],
    });

    await expect(
      owner.tickets.properties.create({ label: 'Plan', type: 'select' }),
    ).rejects.toThrow('Add the choices');
    await expect(owner.tickets.create({ pipelineId: pipeline.id, name: 'A' })).rejects.toThrow(
      'Fill in Size',
    );
    await expect(
      owner.tickets.create({ pipelineId: other.id, name: 'B', propertiesData: { [seats.id]: 3 } }),
    ).rejects.toThrow("Pick a property of the ticket's pipeline");
    await expect(
      owner.tickets.create({
        pipelineId: pipeline.id,
        name: 'C',
        propertiesData: { [size.id]: 'XL' },
      }),
    ).rejects.toThrow("Size isn't a valid value");

    const ticket = await owner.tickets.create({
      pipelineId: pipeline.id,
      name: 'D',
      propertiesData: { [size.id]: 'S' },
    });

    await expect(
      owner.tickets.update({ id: ticket.id, propertiesData: { [seats.id]: 4 } }),
    ).resolves.toMatchObject({ propertiesData: { [size.id]: 'S', [seats.id]: 4 } });
    await expect(
      owner.tickets.update({ id: ticket.id, propertiesData: { [size.id]: null } }),
    ).rejects.toThrow('Fill in Size');
    await expect(
      owner.tickets.update({ id: ticket.id, propertiesData: { [seats.id]: null } }),
    ).resolves.toMatchObject({ propertiesData: { [size.id]: 'S' } });

    await owner.tickets.properties.remove({ ids: [size.id] });

    await expect(owner.tickets.get({ id: ticket.id })).resolves.toMatchObject({
      propertiesData: {},
    });
    expect(ids(await owner.tickets.properties.list({ pipelineId: other.id }))).toEqual([]);
  });

  it('tells the new assignees and the followers, never the one who acted', async () => {
    const { ann, pipeline, stage } = await setUp('org-tf-c');

    const ticket = await ann.tickets.create({
      pipelineId: pipeline.id,
      name: 'Login',
      assigneeId: 'ann',
      subscribedUserIds: ['bob'],
    });

    await ann.tickets.update({ id: ticket.id, assignedMemberIds: ['bob'] });
    await ann.tickets.update({ id: ticket.id, statusId: stage(2) });

    const { rows } = await eventsOf('org-tf-c', ticket.id);

    expect(rows.map((row) => [row.type, row.notify?.userIds ?? null])).toEqual([
      ['frontline.ticket.created', null],
      ['frontline.ticket.assigned', ['bob']],
      ['frontline.ticket.moved', ['bob']],
    ]);
  });

  it("records each change and the deletion in core's audit log, by who made it", async () => {
    const { owner, ann, pipeline } = await setUp('org-tf-h');
    const ticket = await ann.tickets.create({ pipelineId: pipeline.id, name: 'Refund' });

    await ann.tickets.update({ id: ticket.id, name: 'Refund twice' });
    await owner.tickets.bulkRemove({ ids: [ticket.id] });

    const { rows } = await withOrg('org-tf-h', (tx) =>
      tx.execute<{ action: string; actor_id: string; target_label: string | null }>(
        sql`select action, actor_id, target_label from core_audit_logs
            where target_id = ${ticket.id} order by created_at, action`,
      ),
    );

    expect(rows).toEqual([
      { action: 'frontline.ticket.created', actor_id: 'ann', target_label: null },
      { action: 'frontline.ticket.fields_changed', actor_id: 'ann', target_label: null },
      { action: 'frontline.ticket.removed', actor_id: 'user-org-tf-h', target_label: 'Refund twice' },
    ]);
  });
});

describe('status rights', () => {
  it('keeps private statuses, edits and moves to the members a status lists', async () => {
    const { owner, ann, bob, pipeline, stage } = await setUp('org-tf-d');
    const ticket = await ann.tickets.create({ pipelineId: pipeline.id, name: 'Login' });

    await owner.pipelines.statuses.update({ id: stage(1), canEditMemberIds: ['ann'] });

    await expect(bob.tickets.update({ id: ticket.id, name: 'Logout' })).rejects.toThrow(
      'Only the members New lists may edit its tickets',
    );
    await expect(ann.tickets.update({ id: ticket.id, name: 'Logout' })).resolves.toMatchObject({
      canEdit: true,
    });
    await expect(bob.tickets.get({ id: ticket.id })).resolves.toMatchObject({ canEdit: false });

    await owner.pipelines.statuses.update({ id: stage(1), canMoveMemberIds: ['bob'] });

    await expect(ann.tickets.update({ id: ticket.id, statusId: stage(2) })).rejects.toThrow(
      'Only the members New lists may move its tickets',
    );

    await owner.pipelines.statuses.update({
      id: stage(2),
      visibilityType: 'private',
      memberIds: ['ann'],
    });

    const { statuses } = await bob.pipelines.choices();

    expect(statuses.map((status) => status.id)).not.toContain(stage(2));
    await expect(bob.tickets.update({ id: ticket.id, statusId: stage(2) })).rejects.toThrow(
      'That status is private to its members',
    );

    await owner.tickets.update({ id: ticket.id, statusId: stage(2) });

    await expect(bob.tickets.get({ id: ticket.id })).rejects.toThrow('No such ticket');
    await expect(ann.tickets.get({ id: ticket.id })).resolves.toMatchObject({ canMove: true });
  });

  it("shows members only their own, followed, unheld and teams' tickets where the pipeline checks", async () => {
    const { owner, ann, bob, pipeline } = await setUp('org-tf-e');
    const care = await owner.teams.create({ kind: 'department', name: 'Care', memberIds: ['bob'] });

    const mine = await ann.tickets.create({
      pipelineId: pipeline.id,
      name: 'Mine',
      assigneeId: 'ann',
    });

    const followed = await ann.tickets.create({
      pipelineId: pipeline.id,
      name: 'Followed',
      assigneeId: 'ann',
      subscribedUserIds: ['bob'],
    });

    const unheld = await owner.tickets.create({ pipelineId: pipeline.id, name: 'Unheld' });

    const careTicket = await owner.tickets.create({
      pipelineId: pipeline.id,
      name: 'Care',
      assigneeId: 'ann',
      departmentId: care.id,
    });

    const anns = await owner.tickets.create({
      pipelineId: pipeline.id,
      name: 'Ann',
      assigneeId: 'ann',
    });

    const seen = async () => new Set(ids((await bob.tickets.list({})).tickets));

    expect((await seen()).size).toBe(5);

    await owner.pipelines.update({ id: pipeline.id, isCheckUser: true });

    expect(await seen()).toEqual(new Set([followed.id, unheld.id]));

    await owner.pipelines.update({ id: pipeline.id, isCheckDepartment: true });

    expect(await seen()).toEqual(new Set([followed.id, unheld.id, careTicket.id]));
    expect(ids((await ann.tickets.list({})).tickets)).toContain(mine.id);

    await owner.pipelines.update({ id: pipeline.id, excludeCheckUserIds: ['bob'] });

    expect(await seen()).toContain(anns.id);
  });
});

describe('SLA job', () => {
  it('warns and then breaches each clock once, telling the assignees', async () => {
    const { owner, pipeline } = await setUp('org-tf-f');

    await owner.pipelines.update({
      id: pipeline.id,
      slaPolicy: {
        enabled: true,
        rules: [{ priority: 4, firstResponseMinutes: 30, resolutionMinutes: 240 }],
        warnBeforeMinutes: 60,
      },
    });

    const ticket = await owner.tickets.create({
      pipelineId: pipeline.id,
      name: 'Outage',
      priority: 4,
      assigneeId: 'ann',
      assignedMemberIds: ['bob'],
    });

    // Within an hour of the first response's due time, and four hours from the resolution's.
    await expect(checkSla('org-tf-f')).resolves.toEqual({ notified: 1 });
    await expect(checkSla('org-tf-f')).resolves.toEqual({ notified: 0 });

    await withOrg('org-tf-f', (tx) =>
      tx.execute(sql`update frontline_tickets
        set first_response_due_at = now() - interval '1 minute',
            resolution_due_at = now() + interval '30 minutes'
        where id = ${ticket.id}`),
    );

    await expect(checkSla('org-tf-f')).resolves.toEqual({ notified: 2 });
    await expect(checkSla('org-tf-f')).resolves.toEqual({ notified: 0 });

    const { rows } = await eventsOf('org-tf-f', ticket.id);
    const sla = rows.filter((row) => row.type.includes('.sla_'));

    expect(sla.map((row) => row.type)).toEqual([
      'frontline.ticket.sla_warning',
      'frontline.ticket.sla_breached',
      'frontline.ticket.sla_warning',
    ]);
    expect(sla[1]?.notify?.userIds).toEqual(['ann', 'bob']);
  });
});
