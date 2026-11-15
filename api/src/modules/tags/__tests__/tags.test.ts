import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';

describe('tags', () => {
  it('lists one type by name, refuses a repeated name and stays in its organisation', async () => {
    const owner = clientAs('org-tg-a');

    await owner.tags.create({ type: 'ticket', name: 'Urgent', colorCode: '#EF4444' });
    await owner.tags.create({ type: 'ticket', name: 'billing' });
    await owner.tags.create({ type: 'conversation', name: 'Urgent' });

    await expect(owner.tags.create({ type: 'ticket', name: 'URGENT' })).rejects.toMatchObject({
      code: 'TAG_NAME_TAKEN',
    });

    const listed = await owner.tags.list({ type: 'ticket' });

    expect(listed.map((tag) => tag.name)).toEqual(['billing', 'Urgent']);
    expect(listed[1]).not.toHaveProperty('orgId');
    await expect(owner.tags.list({ type: 'ticket', search: 'bil' })).resolves.toHaveLength(1);
    await expect(clientAs('org-tg-b').tags.list({ type: 'ticket' })).resolves.toEqual([]);
  });

  it('lets members read tags and only settings managers change them', async () => {
    const owner = clientAs('org-tg-c');
    const agent = clientAs('org-tg-c', [PERMISSIONS.channelView], 'agent');
    const tag = await owner.tags.create({ type: 'ticket', name: 'VIP' });

    await expect(agent.tags.get({ id: tag.id })).resolves.toMatchObject({ name: 'VIP' });
    await expect(agent.tags.update({ id: tag.id, name: 'Gold' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    await expect(owner.tags.update({ id: tag.id, name: 'Gold' })).resolves.toMatchObject({
      name: 'Gold',
    });
  });
});
