import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { clientAs } from '#/test/member.ts';

const agent = [PERMISSIONS.channelView];

describe('channels', () => {
  it('creates a channel with its creator as admin, then renames and deletes it', async () => {
    const owner = clientAs('org-a');

    const support = await owner.channels.create({
      name: 'Support',
      icon: 'IconHeadphones',
      memberIds: ['teammate', 'user-org-a'],
    });

    expect(support).toMatchObject({
      name: 'Support',
      description: '',
      icon: 'IconHeadphones',
      createdBy: 'user-org-a',
      memberIds: ['user-org-a', 'teammate'],
      role: 'admin',
      canManage: true,
    });
    expect(support).not.toHaveProperty('orgId');

    await owner.channels.create({ name: 'billing' });
    await expect(owner.channels.list({})).resolves.toMatchObject({
      canCreate: true,
      channels: [{ name: 'billing', icon: null }, { name: 'Support' }],
    });
    await expect(
      owner.channels.update({ id: support.id, name: 'Help', description: 'Customer help' }),
    ).resolves.toMatchObject({
      name: 'Help',
      description: 'Customer help',
      icon: 'IconHeadphones',
    });
    await expect(owner.channels.remove({ ids: [support.id] })).resolves.toEqual({
      ids: [support.id],
    });
    await expect(owner.channels.get({ id: support.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('finds channels by part of their name, ignoring case and LIKE wildcards', async () => {
    const owner = clientAs('org-g');

    await owner.channels.create({ name: 'Customer support' });
    await owner.channels.create({ name: 'Support_VIP' });
    await owner.channels.create({ name: 'Sales' });

    const names = async (search: string) =>
      (await owner.channels.list({ search })).channels.map((channel) => channel.name);

    await expect(names('SUPPORT')).resolves.toEqual(['Customer support', 'Support_VIP']);
    await expect(names('t_v')).resolves.toEqual(['Support_VIP']);
    await expect(names('%')).resolves.toEqual([]);
  });

  it("narrows channels by the filter bar's rules and refuses a field the list lacks", async () => {
    const owner = clientAs('org-h');

    await owner.channels.create({ name: 'Billing', memberIds: ['agent-h'] });
    await owner.channels.create({ name: 'Sales' });

    const names = async (rules: unknown[], match = 'all') =>
      (await owner.channels.list({ filter: JSON.stringify({ match, rules }) })).channels.map(
        (channel) => channel.name,
      );

    const withAgent = { path: 'subject.memberIds', op: 'in', value: ['agent-h'] };
    const named = { path: 'subject.name', op: 'contains', value: 'sal' };

    await expect(names([withAgent])).resolves.toEqual(['Billing']);
    await expect(names([withAgent, named])).resolves.toEqual([]);
    await expect(names([withAgent, named], 'any')).resolves.toEqual(['Billing', 'Sales']);
    await expect(
      names([{ path: 'subject.createdBy', op: 'eq', value: 'me' }]),
    ).resolves.toHaveLength(2);
    await expect(
      names([{ path: 'subject.orgId', op: 'eq', value: 'org-a' }]),
    ).rejects.toMatchObject({ code: 'INVALID_FILTER', status: 400 });
  });

  it('counts the pipelines, forms and response templates of each channel', async () => {
    const owner = clientAs('org-counts');
    const billing = await owner.channels.create({ name: 'Billing' });

    await owner.channels.create({ name: 'Sales' });
    await owner.pipelines.create({ channelId: billing.id, name: 'Refunds' });
    await owner.forms.create({ channelId: billing.id, name: 'Contact', title: 'Contact us' });
    await owner.forms.create({ channelId: billing.id, name: 'Rating', title: 'Rate us' });
    await owner.responseTemplates.create({ channelId: billing.id, name: 'Greeting' });

    const counted = async (rules: unknown[] = []) =>
      (await owner.channels.list({ filter: JSON.stringify({ match: 'all', rules }) })).channels.map(
        ({ name, pipelineCount, formCount, templateCount }) => ({
          name,
          pipelineCount,
          formCount,
          templateCount,
        }),
      );

    await expect(counted()).resolves.toEqual([
      { name: 'Billing', pipelineCount: 1, formCount: 2, templateCount: 1 },
      { name: 'Sales', pipelineCount: 0, formCount: 0, templateCount: 0 },
    ]);
    await expect(
      counted([{ path: 'subject.formCount', op: 'gt', value: 1 }]),
    ).resolves.toMatchObject([{ name: 'Billing' }]);
  });

  it('gets the tickets of a pipeline that moves to it, and takes them when it is removed', async () => {
    const owner = clientAs('org-ch-moves');
    const support = await owner.channels.create({ name: 'Support' });
    const billing = await owner.channels.create({ name: 'Billing' });
    const pipeline = await owner.pipelines.create({ channelId: support.id, name: 'Main' });
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

  it('refuses a name the organisation already uses, ignoring case', async () => {
    const owner = clientAs('org-b');

    await owner.channels.create({ name: 'Sales' });
    const other = await owner.channels.create({ name: 'Leads' });

    await expect(owner.channels.create({ name: 'SALES' })).rejects.toMatchObject({
      code: 'CHANNEL_NAME_TAKEN',
      data: { name: 'SALES' },
    });
    await expect(owner.channels.update({ id: other.id, name: 'sales' })).rejects.toMatchObject({
      code: 'CHANNEL_NAME_TAKEN',
    });
  });

  it('shows an agent only the channels they belong to, and lets only admins change one', async () => {
    const owner = clientAs('org-c');
    const joined = await owner.channels.create({ name: 'Joined' });
    const other = await owner.channels.create({ name: 'Other' });

    await expect(
      owner.channels.addMembers({ id: joined.id, userIds: ['user-org-c'] }),
    ).resolves.toEqual([{ userId: 'user-org-c', role: 'admin' }]);

    // The agent is a different user from the owner in the same organisation.
    const agentId = 'agent-c';
    const asAgent = clientAs('org-c', agent, agentId);

    await owner.channels.addMembers({ id: joined.id, userIds: [agentId] });
    await expect(asAgent.channels.list({})).resolves.toEqual({
      canCreate: false,
      channels: [expect.objectContaining({ id: joined.id, role: 'member', canManage: false })],
    });
    await expect(asAgent.channels.get({ id: other.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(asAgent.channels.update({ id: joined.id, name: 'Mine' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(asAgent.channels.create({ name: 'New' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    await owner.channels.setRole({ id: joined.id, userId: agentId, role: 'admin' });
    await expect(asAgent.channels.update({ id: joined.id, name: 'Mine' })).resolves.toMatchObject({
      name: 'Mine',
      role: 'admin',
      canManage: true,
    });
  });

  it('keeps one admin in every channel', async () => {
    const owner = clientAs('org-d');
    const channel = await owner.channels.create({ name: 'Ops' });

    await owner.channels.addMembers({ id: channel.id, userIds: ['teammate', 'helper'] });
    await expect(
      owner.channels.removeMembers({ id: channel.id, userIds: ['user-org-d', 'helper'] }),
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' });
    await expect(
      owner.channels.setRole({ id: channel.id, userId: 'user-org-d', role: 'member' }),
    ).rejects.toMatchObject({ code: 'LAST_ADMIN' });

    await owner.channels.setRole({ id: channel.id, userId: 'teammate', role: 'admin' });
    await expect(
      owner.channels.removeMembers({ id: channel.id, userIds: ['user-org-d', 'helper', 'nobody'] }),
    ).resolves.toEqual(expect.arrayContaining([{ userId: 'user-org-d' }, { userId: 'helper' }]));
    await expect(owner.channels.get({ id: channel.id })).resolves.toMatchObject({
      memberIds: ['teammate'],
      role: null,
      canManage: true,
    });
    await expect(owner.channels.members({ id: channel.id })).resolves.toMatchObject([
      { userId: 'teammate', role: 'admin' },
    ]);
    await expect(
      owner.channels.members({
        id: channel.id,
        filter: JSON.stringify({
          match: 'all',
          rules: [{ path: 'subject.role', op: 'eq', value: 'member' }],
        }),
      }),
    ).resolves.toEqual([]);
  });

  it('shows and changes only the channels of its own organisation', async () => {
    const theirs = await clientAs('org-e').channels.create({ name: 'Shared name' });
    const ours = clientAs('org-f');

    await expect(ours.channels.list({})).resolves.toMatchObject({ channels: [] });
    const own = await ours.channels.create({ name: 'Shared name' });
    expect(own).toMatchObject({ name: 'Shared name' });
    await expect(ours.channels.get({ id: theirs.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      ours.channels.addMembers({ id: theirs.id, userIds: ['intruder'] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // One refused id removes none of them.
    await expect(ours.channels.remove({ ids: [own.id, theirs.id] })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(ours.channels.get({ id: own.id })).resolves.toMatchObject({ id: own.id });
  });

  it('gives each member one personal inbox that only they see and belong to', async () => {
    const owner = clientAs('org-ch-personal');
    const asAgent = clientAs('org-ch-personal', agent, 'agent-p');

    const mine = await owner.channels.personal();

    expect(mine).toMatchObject({
      name: 'Personal inbox',
      ownerId: 'user-org-ch-personal',
      memberIds: ['user-org-ch-personal'],
      role: 'admin',
    });
    await expect(owner.channels.personal()).resolves.toMatchObject({ id: mine.id });

    const theirs = await asAgent.channels.personal();

    expect(theirs.id).not.toBe(mine.id);
    await expect(owner.channels.create({ name: 'Personal inbox' })).resolves.toMatchObject({
      ownerId: null,
    });
    await expect(owner.channels.list({})).resolves.toMatchObject({
      channels: [{ name: 'Personal inbox', ownerId: null }],
    });
    await expect(owner.channels.get({ id: theirs.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      owner.channels.addMembers({ id: mine.id, userIds: ['agent-p'] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('puts what happens to a channel on its timeline, in the order it happened', async () => {
    const owner = clientAs('org-ch-timeline', undefined, 'boss');
    const channel = await owner.channels.create({ name: 'Billing', memberIds: ['ann'] });

    await owner.channels.update({ id: channel.id, name: 'Billing', description: 'Refunds' });
    await owner.channels.update({ id: channel.id, name: 'Billing' });
    await owner.channels.setRole({ id: channel.id, userId: 'ann', role: 'admin' });
    await owner.channels.removeMembers({ id: channel.id, userIds: ['ann'] });

    // Core's Activity tab orders by when each happened, then by id.
    const { rows } = await withOrg('org-ch-timeline', (tx) =>
      tx.execute<{ type: string; summary: string; entity_type: string; entity_id: string }>(
        sql`select type, summary, entity_type, entity_id from core_events where org_id = 'org-ch-timeline' order by occurred_at, id`,
      ),
    );

    const on = { entity_type: 'frontline.channel', entity_id: channel.id };

    expect(rows).toEqual([
      { ...on, type: 'frontline.channel.created', summary: 'Created Billing' },
      { ...on, type: 'frontline.channel.members_added', summary: 'Added a member' },
      { ...on, type: 'frontline.channel.fields_changed', summary: 'Changed description' },
      { ...on, type: 'frontline.channel.role_changed', summary: 'Made a member an admin' },
      { ...on, type: 'frontline.channel.members_removed', summary: 'Removed a member' },
    ]);
  });

  it('tells members they were added, once, and never the one who added them', async () => {
    const owner = clientAs('org-ch-notice', undefined, 'boss');
    const channel = await owner.channels.create({ name: 'Billing', memberIds: ['ann', 'boss'] });

    await owner.channels.addMembers({ id: channel.id, userIds: ['ann', 'bob'] });

    const { rows } = await withOrg('org-ch-notice', (tx) =>
      tx.execute<{ notify: { userIds: string[]; title: string } }>(
        sql`select notify from core_events where org_id = 'org-ch-notice' and type = 'frontline.channel.members_added' order by seq`,
      ),
    );

    expect(rows.map((row) => row.notify)).toEqual([
      expect.objectContaining({ userIds: ['ann'], title: 'You were added to Billing' }),
      expect.objectContaining({ userIds: ['bob'] }),
    ]);
  });
});
