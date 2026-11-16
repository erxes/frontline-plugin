import type * as Sdk from '@erxes/plugin-sdk';
import { describe, expect, it, vi } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { teamMembers, teams } from '#/db/teams.ts';
import { coreUnits } from '#/test/coreUnits.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';
import { addUnit, removeUnit, runUnitsJob } from '#/test/units.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('#/test/coreUnits.ts')).unitsStandIn(await importOriginal()),
);

// Core signs each event delivery; here the token `core-event` stands for its signature.
vi.mock('@erxes/plugin-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof Sdk>();

  return {
    ...actual,
    verifyCoreEvent: async (authorization: string | undefined, raw: string) => {
      if (authorization !== 'Bearer core-event') throw new Error('not signed by core');

      return actual.DeliveredEvent.parse(JSON.parse(raw));
    },
  };
});

const { post } = serve('/api');

/** `core.unit.<action>` about `unitId`, as core delivers it to `/api/events`. */
const unitEvent = (orgId: string, action: string, unitId: string) => {
  const at = new Date().toISOString();

  return {
    id: `event-${unitId}-${action}`,
    type: `core.unit.${action}`,
    organizationId: orgId,
    createdAt: at,
    data: {
      id: `event-${unitId}-${action}`,
      source: 'core',
      type: `core.unit.${action}`,
      version: 1,
      subjectType: null,
      subjectId: null,
      entityType: 'unit',
      entityId: unitId,
      actorType: 'user',
      actorId: 'admin',
      payload: { kind: 'department', changed: ['name'] },
      summary: null,
      link: null,
      occurredAt: at,
      createdAt: at,
    },
  };
};

/** A channel's pipeline in `orgId` to file tickets in. */
const pipelineOf = async (orgId: string) => {
  const owner = clientAs(orgId);
  const channel = await owner.channels.create({ name: 'Support' });

  return { owner, pipeline: await owner.pipelines.create({ channelId: channel.id, name: 'Main' }) };
};

describe('teams from core', () => {
  it("copies core's branches and departments with their members and supervisor", async () => {
    const owner = clientAs('org-tm-a');

    const care = await addUnit('org-tm-a', {
      kind: 'department',
      name: 'Care',
      code: 'CARE',
      supervisorId: 'lead',
      memberIds: ['ann', 'bob', 'ann'],
    });

    await addUnit('org-tm-a', { kind: 'branch', name: 'North' });

    await expect(owner.teams.list({ kind: 'department' })).resolves.toMatchObject([
      { id: care.id, name: 'Care', code: 'CARE', memberIds: ['ann', 'bob'], supervisorId: 'lead' },
    ]);
    await expect(owner.teams.list({ kind: 'branch' })).resolves.toMatchObject([{ name: 'North' }]);
    await expect(clientAs('org-tm-b').teams.list({ kind: 'department' })).resolves.toEqual([]);
  });

  it('follows renames, moves and member changes, and changes nothing on a second run', async () => {
    const owner = clientAs('org-tm-c');
    const top = await addUnit('org-tm-c', { kind: 'department', name: 'Top', memberIds: ['ann'] });
    const child = await addUnit('org-tm-c', { kind: 'department', name: 'Child' });

    // Child moves under a new unit, and Top's member changes.
    coreUnits.put('org-tm-c', { ...child, name: 'Kid', parentId: 'zz-new' });
    coreUnits.put('org-tm-c', {
      id: 'zz-new',
      kind: 'department',
      name: 'New',
      memberIds: ['cid'],
    });
    coreUnits.put('org-tm-c', { ...top, memberIds: ['bob'] });

    await expect(runUnitsJob('org-tm-c')).resolves.toMatchObject({ units: 3, removed: 0 });
    await runUnitsJob('org-tm-c');

    await expect(owner.teams.get({ id: child.id })).resolves.toMatchObject({
      name: 'Kid',
      parentId: 'zz-new',
    });
    await expect(owner.teams.get({ id: top.id })).resolves.toMatchObject({ memberIds: ['bob'] });
    await expect(owner.teams.list({ kind: 'department' })).resolves.toHaveLength(3);
  });

  it('drops a team core deleted, clearing it from tickets and lifting the teams under it', async () => {
    const { owner, pipeline } = await pipelineOf('org-tm-d');
    const top = await addUnit('org-tm-d', { kind: 'department', name: 'Top', memberIds: ['ann'] });

    const child = await addUnit('org-tm-d', {
      kind: 'department',
      name: 'Child',
      parentId: top.id,
    });

    const ticket = await owner.tickets.create({
      pipelineId: pipeline.id,
      name: 'Refund',
      departmentId: top.id,
    });

    await removeUnit('org-tm-d', top.id);

    await expect(owner.tickets.get({ id: ticket.id })).resolves.toMatchObject({
      departmentId: null,
    });
    await expect(owner.teams.get({ id: top.id })).rejects.toThrow('No such team');
    await expect(owner.teams.get({ id: child.id })).resolves.toMatchObject({ parentId: null });

    const left = await withOrg('org-tm-d', (tx) => tx.select().from(teamMembers));

    expect(left).toEqual([]);
  });

  it("refreshes the copy when core reports a unit's change, and refuses unsigned events", async () => {
    const owner = clientAs('org-tm-e');
    const care = await addUnit('org-tm-e', { kind: 'department', name: 'Care' });

    coreUnits.put('org-tm-e', { ...care, name: 'Customer care' });

    await expect(post('/events', unitEvent('org-tm-e', 'updated', care.id))).resolves.toEqual({
      status: 401,
      body: { message: 'Only core delivers events' },
    });
    await expect(owner.teams.get({ id: care.id })).resolves.toMatchObject({ name: 'Care' });

    await expect(
      post('/events', unitEvent('org-tm-e', 'updated', care.id), 'core-event'),
    ).resolves.toMatchObject({ status: 204 });
    await expect(owner.teams.get({ id: care.id })).resolves.toMatchObject({
      name: 'Customer care',
    });
  });

  it("brings the organisation's own teams to core once, moving tickets to the units they merged into", async () => {
    const { owner, pipeline } = await pipelineOf('org-tm-f');

    // Core already has Care, by code; frontline has its own Care and North from before.
    coreUnits.put('org-tm-f', { id: 'core-care', kind: 'department', name: 'Care', code: 'C1' });
    await withOrg('org-tm-f', async (tx) => {
      await tx.insert(teams).values([
        { id: 'old-care', orgId: 'org-tm-f', kind: 'department', name: 'Care team', code: 'c1' },
        { id: 'old-north', orgId: 'org-tm-f', kind: 'branch', name: 'North' },
      ]);
      await tx.insert(teamMembers).values([
        { orgId: 'org-tm-f', teamId: 'old-care', userId: 'ann' },
        { orgId: 'org-tm-f', teamId: 'old-north', userId: 'bob' },
      ]);
    });

    const ticket = await owner.tickets.create({
      pipelineId: pipeline.id,
      name: 'Refund',
      departmentId: 'old-care',
      branchId: 'old-north',
    });

    await expect(runUnitsJob('org-tm-f')).resolves.toMatchObject({ adopted: 2, removed: 1 });
    await expect(runUnitsJob('org-tm-f')).resolves.toMatchObject({ adopted: 0, removed: 0 });

    expect(coreUnits.imports.filter((sent) => sent.orgId === 'org-tm-f')).toEqual([
      { orgId: 'org-tm-f', ids: ['old-care', 'old-north'] },
    ]);
    expect(coreUnits.of('org-tm-f')).toMatchObject([
      { id: 'core-care', memberIds: ['ann'] },
      { id: 'old-north', kind: 'branch', memberIds: ['bob'] },
    ]);
    await expect(owner.tickets.get({ id: ticket.id })).resolves.toMatchObject({
      departmentId: 'core-care',
      branchId: 'old-north',
    });
    await expect(owner.teams.list({ kind: 'department' })).resolves.toMatchObject([
      { id: 'core-care', name: 'Care', memberIds: ['ann'] },
    ]);
  });

  it('lets members read teams and refuses members without frontline', async () => {
    const agent = clientAs('org-tm-g', [PERMISSIONS.channelView], 'agent');

    await expect(agent.teams.list({ kind: 'branch' })).resolves.toEqual([]);
    await expect(
      clientAs('org-tm-g', [], 'stranger').teams.list({ kind: 'branch' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
