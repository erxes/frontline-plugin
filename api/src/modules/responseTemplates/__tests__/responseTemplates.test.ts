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

    await expect(owner.responseTemplates.remove({ ids: [greeting.id] })).resolves.toEqual({
      ids: [greeting.id],
    });
    await expect(owner.responseTemplates.get({ id: greeting.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it("narrows templates by the filter bar's rules and searches the content's words", async () => {
    const owner = clientAs('org-rt-f');
    const channel = await owner.channels.create({ name: 'Support' });

    const blocks = JSON.stringify([
      {
        id: 'b1',
        type: 'paragraph',
        props: { textColor: 'default' },
        content: [{ type: 'text', text: 'Your refund is on its way', styles: {} }],
        children: [],
      },
    ]);

    await owner.responseTemplates.create({
      channelId: channel.id,
      name: 'Refund',
      content: blocks,
    });
    await owner.responseTemplates.create({
      channelId: channel.id,
      name: 'Greeting',
      content: 'Hi',
    });

    const names = async (input: { search?: string; rules?: unknown[] }) =>
      (
        await owner.responseTemplates.list({
          channelId: channel.id,
          search: input.search,
          filter: input.rules && JSON.stringify({ match: 'all', rules: input.rules }),
        })
      ).templates.map((template) => template.name);

    // The blocks' words match; their JSON keys and block types don't.
    await expect(names({ search: 'REFUND IS' })).resolves.toEqual(['Refund']);
    await expect(names({ search: 'paragraph' })).resolves.toEqual([]);
    await expect(
      names({ rules: [{ path: 'subject.content', op: 'contains', value: 'on its way' }] }),
    ).resolves.toEqual(['Refund']);
    await expect(
      names({ rules: [{ path: 'subject.content', op: 'eq', value: 'hi' }] }),
    ).resolves.toEqual(['Greeting']);
    await expect(
      names({ rules: [{ path: 'subject.name', op: 'starts_with', value: 'gre' }] }),
    ).resolves.toEqual(['Greeting']);
    await expect(
      names({ rules: [{ path: 'subject.createdBy', op: 'eq', value: 'me' }] }),
    ).resolves.toHaveLength(2);
    await expect(
      names({
        rules: [
          { path: 'subject.updatedAt', op: 'within_last', value: { amount: 1, unit: 'days' } },
        ],
      }),
    ).resolves.toHaveLength(2);
    await expect(
      names({
        rules: [
          { path: 'subject.createdAt', op: 'more_than_ago', value: { amount: 1, unit: 'days' } },
        ],
      }),
    ).resolves.toEqual([]);
    await expect(
      names({ rules: [{ path: 'subject.channelId', op: 'eq', value: channel.id }] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('pages newest first by cursor and counts every match', async () => {
    const owner = clientAs('org-rt-b');
    const channel = await owner.channels.create({ name: 'Sales' });

    for (let index = 0; index < 52; index++)
      await owner.responseTemplates.create({ channelId: channel.id, name: `Reply ${index}` });

    const first = await owner.responseTemplates.list({ channelId: channel.id });

    expect(first).toMatchObject({ totalCount: 52 });
    expect(first.templates).toHaveLength(50);
    expect(first.templates[0]).toMatchObject({ name: 'Reply 51', canManage: true });

    const rest = await owner.responseTemplates.list({
      channelId: channel.id,
      cursor: first.nextCursor ?? undefined,
    });

    expect(rest.templates.map((template) => template.name)).toEqual(['Reply 1', 'Reply 0']);
    expect(rest.nextCursor).toBeNull();

    const count = await owner.responseTemplates.list({ channelId: channel.id, limit: 1 });

    expect(count).toMatchObject({ totalCount: 52, nextCursor: count.templates[0]?.id });
    expect(count.templates).toHaveLength(1);
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
      templates: [{ id: template.id, canManage: false }],
    });
    await expect(agent.responseTemplates.get({ id: template.id })).resolves.toMatchObject({
      canManage: false,
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
