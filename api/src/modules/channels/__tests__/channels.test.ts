import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';

const agent = [PERMISSIONS.channelView];

describe('channels', () => {
  it('creates a channel with its creator as admin, then renames and deletes it', async () => {
    const owner = clientAs('org-a');

    const support = await owner.channels.create({
      name: 'Support',
      icon: 'IconHeadset',
      memberIds: ['teammate', 'user-org-a'],
    });

    expect(support).toMatchObject({
      name: 'Support',
      description: '',
      icon: 'IconHeadset',
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
    ).resolves.toMatchObject({ name: 'Help', description: 'Customer help', icon: 'IconHeadset' });
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

    const names = async (name: string) =>
      (await owner.channels.list({ name })).channels.map((channel) => channel.name);

    await expect(names('SUPPORT')).resolves.toEqual(['Customer support', 'Support_VIP']);
    await expect(names('t_v')).resolves.toEqual(['Support_VIP']);
    await expect(names('%')).resolves.toEqual([]);
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
      members: [{ userId: 'teammate', role: 'admin' }],
    });
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
});
