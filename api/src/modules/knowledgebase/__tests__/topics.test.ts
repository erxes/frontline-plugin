import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';

describe('knowledge base topics and categories', () => {
  it('creates, lists, edits and deletes a topic with everything in it', async () => {
    const owner = clientAs('org-kb-a');
    const topic = await owner.knowledgebase.topics.create({ title: 'Help', code: ' help ' });

    expect(topic).toMatchObject({
      title: 'Help',
      code: 'help',
      color: null,
      createdBy: 'user-org-kb-a',
    });
    expect(topic).not.toHaveProperty('orgId');

    await owner.knowledgebase.topics.create({ title: 'about us' });

    const listed = await owner.knowledgebase.topics.list({});

    expect(listed.topics.map((row) => row.title)).toEqual(['about us', 'Help']);
    expect(listed.can).toEqual({ topics: true, categories: true, articles: true });

    const byCode = await owner.knowledgebase.topics.list({
      filter: JSON.stringify({
        match: 'all',
        rules: [{ path: 'subject.code', op: 'eq', value: 'HELP' }],
      }),
    });

    expect(byCode.topics.map((row) => row.title)).toEqual(['Help']);
    await expect(owner.knowledgebase.topics.list({ search: 'ABOUT' })).resolves.toMatchObject({
      topics: [{ title: 'about us' }],
    });

    await expect(
      owner.knowledgebase.topics.update({ id: topic.id, color: '#4f46e5', description: '  ' }),
    ).resolves.toMatchObject({ title: 'Help', color: '#4f46e5', description: null });

    await expect(
      owner.knowledgebase.topics.create({ title: 'Again', code: 'help' }),
    ).rejects.toMatchObject({
      code: 'CODE_TAKEN',
      data: { code: 'help' },
    });

    const category = await owner.knowledgebase.categories.create({
      topicId: topic.id,
      title: 'Billing',
    });

    const article = await owner.knowledgebase.articles.create({
      categoryId: category.id,
      title: 'Refunds',
    });

    await expect(owner.knowledgebase.topics.get({ id: topic.id })).resolves.toMatchObject({
      categoryCount: 1,
      articleCount: 1,
    });
    await expect(owner.knowledgebase.topics.remove({ ids: [topic.id] })).resolves.toEqual({
      ids: [topic.id],
    });
    await expect(owner.knowledgebase.categories.get({ id: category.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(owner.knowledgebase.articles.get({ id: article.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('nests categories, counts articles down the tree and refuses loops', async () => {
    const owner = clientAs('org-kb-b');
    const topic = await owner.knowledgebase.topics.create({ title: 'Docs' });

    const create = (title: string, parentId?: string) =>
      owner.knowledgebase.categories.create({ topicId: topic.id, title, parentId });

    const guides = await create('Guides');
    const setup = await create('Setup', guides.id);
    const deep = await create('Deep', setup.id);

    await owner.knowledgebase.articles.create({ categoryId: guides.id, title: 'One' });
    await owner.knowledgebase.articles.create({ categoryId: deep.id, title: 'Two' });

    const counts = async () =>
      Object.fromEntries(
        (await owner.knowledgebase.categories.list({ topicId: topic.id })).categories.map((row) => [
          row.title,
          row.articleCount,
        ]),
      );

    await expect(counts()).resolves.toEqual({ Deep: 1, Guides: 2, Setup: 1 });

    const under = await owner.knowledgebase.categories.list({
      topicId: topic.id,
      filter: JSON.stringify({
        match: 'all',
        rules: [{ path: 'subject.parentId', op: 'eq', value: guides.id }],
      }),
    });

    // A filtered category still counts the articles under it.
    expect(under.categories).toMatchObject([{ title: 'Setup', articleCount: 1 }]);
    await expect(
      owner.knowledgebase.categories.list({ topicId: topic.id, search: 'dee' }),
    ).resolves.toMatchObject({ categories: [{ title: 'Deep' }] });

    await expect(
      owner.knowledgebase.categories.update({ id: guides.id, parentId: deep.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      owner.knowledgebase.categories.update({ id: guides.id, parentId: guides.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // Deleting a category deletes its articles; its subcategories move to the top level.
    await owner.knowledgebase.categories.remove({ ids: [guides.id] });
    await expect(owner.knowledgebase.categories.get({ id: setup.id })).resolves.toMatchObject({
      parentId: null,
    });
    await expect(counts()).resolves.toEqual({ Deep: 1, Setup: 1 });
  });

  it('moves a category to another topic with its subcategories and articles', async () => {
    const owner = clientAs('org-kb-c');
    const from = await owner.knowledgebase.topics.create({ title: 'From' });
    const to = await owner.knowledgebase.topics.create({ title: 'To' });

    const parent = await owner.knowledgebase.categories.create({
      topicId: from.id,
      title: 'Parent',
    });

    const child = await owner.knowledgebase.categories.create({
      topicId: from.id,
      title: 'Child',
      parentId: parent.id,
    });

    const article = await owner.knowledgebase.articles.create({
      categoryId: child.id,
      title: 'Note',
    });

    const there = await owner.knowledgebase.categories.create({ topicId: to.id, title: 'There' });

    await expect(
      owner.knowledgebase.categories.create({ topicId: to.id, title: 'Odd', parentId: parent.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    await expect(
      owner.knowledgebase.categories.update({ id: parent.id, topicId: to.id }),
    ).resolves.toMatchObject({ topicId: to.id, parentId: null });
    await expect(owner.knowledgebase.categories.get({ id: child.id })).resolves.toMatchObject({
      topicId: to.id,
      parentId: parent.id,
    });

    const moved = await owner.knowledgebase.articles.list({ topicId: to.id });

    expect(moved.articles.map((row) => row.id)).toEqual([article.id]);
    await expect(owner.knowledgebase.articles.list({ topicId: from.id })).resolves.toMatchObject({
      totalCount: 0,
    });

    await expect(
      owner.knowledgebase.categories.update({ id: parent.id, parentId: there.id }),
    ).resolves.toMatchObject({ parentId: there.id });
  });

  it('lets a reader read and refuses their changes', async () => {
    const owner = clientAs('org-kb-d');
    const topic = await owner.knowledgebase.topics.create({ title: 'Help' });
    const reader = clientAs('org-kb-d', [PERMISSIONS.kbView], 'reader-kb-d');

    await expect(reader.knowledgebase.topics.list({})).resolves.toMatchObject({
      topics: [{ id: topic.id }],
      can: { topics: false, categories: false, articles: false },
    });
    await expect(
      reader.knowledgebase.topics.update({ id: topic.id, title: 'Mine' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      reader.knowledgebase.categories.create({ topicId: topic.id, title: 'Mine' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it("doesn't show another organisation's topics", async () => {
    const owner = clientAs('org-kb-e');
    const topic = await owner.knowledgebase.topics.create({ title: 'Private' });
    const other = clientAs('org-kb-f');

    await expect(other.knowledgebase.topics.list({})).resolves.toMatchObject({ topics: [] });
    await expect(other.knowledgebase.topics.get({ id: topic.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      other.knowledgebase.categories.create({ topicId: topic.id, title: 'Sneaky' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
