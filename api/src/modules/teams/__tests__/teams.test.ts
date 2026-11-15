import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';

describe('teams', () => {
  it('keeps departments and branches apart, with their members and supervisor', async () => {
    const owner = clientAs('org-tm-a');

    const care = await owner.teams.create({
      kind: 'department',
      name: 'Care',
      supervisorId: 'lead',
      memberIds: ['ann', 'bob', 'ann'],
    });

    await owner.teams.create({ kind: 'branch', name: 'North' });

    await expect(owner.teams.list({ kind: 'department' })).resolves.toMatchObject([
      { id: care.id, memberIds: ['ann', 'bob'], supervisorId: 'lead' },
    ]);
    await expect(owner.teams.update({ id: care.id, memberIds: ['cid'] })).resolves.toMatchObject({
      memberIds: ['cid'],
    });
    await expect(clientAs('org-tm-b').teams.list({ kind: 'department' })).resolves.toEqual([]);
  });

  it('refuses a parent of another kind or under the team, and lifts children of a deleted one', async () => {
    const owner = clientAs('org-tm-c');
    const top = await owner.teams.create({ kind: 'department', name: 'Top' });
    const child = await owner.teams.create({ kind: 'department', name: 'Child', parentId: top.id });
    const branch = await owner.teams.create({ kind: 'branch', name: 'North' });

    await expect(owner.teams.update({ id: top.id, parentId: child.id })).rejects.toThrow(
      'A team cannot sit under itself',
    );
    await expect(owner.teams.update({ id: child.id, parentId: branch.id })).rejects.toThrow(
      'Pick a department',
    );

    await owner.teams.remove({ ids: [top.id] });

    await expect(owner.teams.get({ id: child.id })).resolves.toMatchObject({ parentId: null });
  });

  it('lets members read teams and only settings managers change them', async () => {
    const agent = clientAs('org-tm-d', [PERMISSIONS.channelView], 'agent');

    await expect(agent.teams.list({ kind: 'branch' })).resolves.toEqual([]);
    await expect(agent.teams.create({ kind: 'branch', name: 'South' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});
