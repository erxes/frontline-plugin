import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';

describe('response templates', () => {
  it('creates, finds, edits, moves and deletes a channel template', async () => {
    const owner = clientAs('org-rt-a');
    const support = await owner.channels.create({ name: 'Support' });
    const billing = await owner.channels.create({ name: 'Billing' });

    const greeting = await owner.responseTemplates.create({
      channelId: support.id,
      name: 'Greeting',
      content: 'Hello, thanks for writing',
    });

    expect(greeting).toMatchObject({ channelId: support.id, createdBy: 'user-org-rt-a' });
    expect(greeting).not.toHaveProperty('orgId');

    await owner.responseTemplates.create({ channelId: support.id, name: 'Refund_policy' });

    const names = async (search?: string) =>
      (await owner.responseTemplates.list({ channelId: support.id, search })).templates.map(
        (template) => template.name,
      );

    await expect(names()).resolves.toEqual(['Refund_policy', 'Greeting']);
    await expect(names('THANKS')).resolves.toEqual(['Greeting']);
    await expect(names('d_p')).resolves.toEqual(['Refund_policy']);
    await expect(names('%')).resolves.toEqual([]);

    await expect(
      owner.responseTemplates.update({ id: greeting.id, name: 'Welcome', channelId: billing.id }),
    ).resolves.toMatchObject({ name: 'Welcome', channelId: billing.id, content: greeting.content });
    await expect(names()).resolves.toEqual(['Refund_policy']);

    await expect(owner.responseTemplates.remove({ id: greeting.id })).resolves.toEqual({
      id: greeting.id,
    });
    await expect(owner.responseTemplates.get({ id: greeting.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('pages newest first by cursor and counts every match', async () => {
    const owner = clientAs('org-rt-b');
    const channel = await owner.channels.create({ name: 'Sales' });

    for (let index = 0; index < 52; index++)
      await owner.responseTemplates.create({ channelId: channel.id, name: `Reply ${index}` });

    const first = await owner.responseTemplates.list({ channelId: channel.id });

    expect(first).toMatchObject({ totalCount: 52, canManage: true });
    expect(first.templates).toHaveLength(50);
    expect(first.templates[0]?.name).toBe('Reply 51');

    const rest = await owner.responseTemplates.list({
      channelId: channel.id,
      cursor: first.nextCursor ?? undefined,
    });

    expect(rest.templates.map((template) => template.name)).toEqual(['Reply 1', 'Reply 0']);
    expect(rest.nextCursor).toBeNull();
  });

  it('lets channel members read templates and only admins change them', async () => {
    const owner = clientAs('org-rt-c');
    const joined = await owner.channels.create({ name: 'Joined' });
    const other = await owner.channels.create({ name: 'Other' });
    const template = await owner.responseTemplates.create({ channelId: joined.id, name: 'Hi' });
    const hidden = await owner.responseTemplates.create({ channelId: other.id, name: 'Secret' });
    const agent = clientAs('org-rt-c', [PERMISSIONS.channelView], 'agent-rt-c');

    await owner.channels.addMembers({ id: joined.id, userIds: ['agent-rt-c'] });

    await expect(agent.responseTemplates.list({ channelId: joined.id })).resolves.toMatchObject({
      canManage: false,
      templates: [{ id: template.id }],
    });
    await expect(agent.responseTemplates.get({ id: hidden.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      agent.responseTemplates.update({ id: template.id, name: 'Changed' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      agent.responseTemplates.create({ channelId: joined.id, name: 'Mine' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // An admin of one channel can't move a template into a channel they only belong to.
    await owner.channels.setRole({ id: joined.id, userId: 'agent-rt-c', role: 'admin' });
    const readOnly = await owner.channels.create({ name: 'Read only' });

    await owner.channels.addMembers({ id: readOnly.id, userIds: ['agent-rt-c'] });
    await expect(
      agent.responseTemplates.update({ id: template.id, channelId: readOnly.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it("doesn't show another organisation's templates", async () => {
    const owner = clientAs('org-rt-d');
    const channel = await owner.channels.create({ name: 'Support' });
    const template = await owner.responseTemplates.create({ channelId: channel.id, name: 'Hi' });

    await expect(
      clientAs('org-rt-e').responseTemplates.get({ id: template.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
