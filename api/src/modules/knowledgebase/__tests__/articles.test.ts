import { setTimeout } from 'node:timers/promises';
import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';

const topicWithCategory = async (orgId: string) => {
  const owner = clientAs(orgId);
  const topic = await owner.knowledgebase.topics.create({ title: 'Help' });

  const category = await owner.knowledgebase.categories.create({
    topicId: topic.id,
    title: 'Billing',
  });

  return { owner, topic, category };
};

/** The filter bar holding one condition, as the UI sends it. */
const rule = (path: string, op: string, value: unknown) => ({
  filter: JSON.stringify({ match: 'all', rules: [{ path, op, value }] }),
});

describe('knowledge base articles', () => {
  it('writes, finds, edits, copies and deletes articles', async () => {
    const { owner, topic, category } = await topicWithCategory('org-kba-a');

    const sub = await owner.knowledgebase.categories.create({
      topicId: topic.id,
      title: 'Cards',
      parentId: category.id,
    });

    const refunds = await owner.knowledgebase.articles.create({
      categoryId: category.id,
      title: 'Refunds',
      content: '<p>Money back in 5_days</p>',
      attachments: [{ url: 'files/terms.pdf', name: 'terms.pdf', size: 120 }],
    });

    expect(refunds).toMatchObject({
      topicId: topic.id,
      status: 'draft',
      publishedAt: null,
      viewCount: 0,
    });
    expect(refunds).not.toHaveProperty('orgId');

    await owner.knowledgebase.articles.create({
      categoryId: sub.id,
      title: 'Card fees',
      status: 'publish',
    });

    const titles = async (input: { filter?: string; search?: string }) =>
      (await owner.knowledgebase.articles.list({ topicId: topic.id, ...input })).articles.map(
        (row) => row.title,
      );

    await expect(titles({})).resolves.toEqual(['Card fees', 'Refunds']);
    // A category keeps its subcategories' articles.
    await expect(titles(rule('subject.categoryId', 'eq', category.id))).resolves.toEqual([
      'Card fees',
      'Refunds',
    ]);
    await expect(titles(rule('subject.categoryId', 'eq', sub.id))).resolves.toEqual(['Card fees']);
    await expect(titles(rule('subject.categoryId', 'neq', sub.id))).resolves.toEqual(['Refunds']);
    await expect(titles(rule('subject.status', 'eq', 'publish'))).resolves.toEqual(['Card fees']);
    await expect(titles(rule('subject.isPrivate', 'eq', false))).resolves.toHaveLength(2);
    await expect(titles(rule('subject.content', 'contains', 'x'))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    await expect(titles({ search: 'MONEY' })).resolves.toEqual(['Refunds']);
    await expect(titles({ search: '5_d' })).resolves.toEqual(['Refunds']);
    await expect(titles({ search: '%' })).resolves.toEqual([]);

    const listed = await owner.knowledgebase.articles.list({ topicId: topic.id });

    expect(listed.articles[0]).not.toHaveProperty('content');

    const edited = await owner.knowledgebase.articles.update({
      id: refunds.id,
      summary: 'How refunds work',
    });

    expect(edited).toMatchObject({ summary: 'How refunds work', content: refunds.content });

    const copy = await owner.knowledgebase.articles.duplicate({
      id: refunds.id,
      title: 'Refunds copy',
    });

    expect(copy).toMatchObject({
      title: 'Refunds copy',
      status: 'draft',
      attachments: refunds.attachments,
    });

    const removed = await owner.knowledgebase.articles.remove({ ids: [refunds.id, copy.id] });

    expect(removed.ids.toSorted()).toEqual([refunds.id, copy.id].toSorted());
    await expect(owner.knowledgebase.articles.get({ id: refunds.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('stamps publishing, needs a future time to schedule and publishes when it comes', async () => {
    const { owner, category } = await topicWithCategory('org-kba-b');

    const article = await owner.knowledgebase.articles.create({
      categoryId: category.id,
      title: 'Soon',
    });

    await expect(
      owner.knowledgebase.articles.update({ id: article.id, status: 'scheduled' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      owner.knowledgebase.articles.update({
        id: article.id,
        status: 'scheduled',
        scheduledAt: new Date(Date.now() - 1000),
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const at = new Date(Date.now() + 1000);

    await expect(
      owner.knowledgebase.articles.update({ id: article.id, status: 'scheduled', scheduledAt: at }),
    ).resolves.toMatchObject({ status: 'scheduled', scheduledAt: at, publishedAt: null });

    await setTimeout(1100);

    await expect(owner.knowledgebase.articles.get({ id: article.id })).resolves.toMatchObject({
      status: 'publish',
      publishedAt: at,
      scheduledAt: null,
    });

    const archived = await owner.knowledgebase.articles.update({
      id: article.id,
      status: 'archived',
    });

    expect(archived.publishedAt).toEqual(at);

    const republished = await owner.knowledgebase.articles.update({
      id: article.id,
      status: 'publish',
    });

    expect(republished.publishedAt?.getTime()).toBeGreaterThan(at.getTime());
  });

  it('sets a status or a category on many articles at once', async () => {
    const { owner, topic, category } = await topicWithCategory('org-kba-c');

    const other = await owner.knowledgebase.categories.create({
      topicId: topic.id,
      title: 'Other',
    });

    const one = await owner.knowledgebase.articles.create({
      categoryId: category.id,
      title: 'One',
    });

    const two = await owner.knowledgebase.articles.create({
      categoryId: category.id,
      title: 'Two',
    });

    await owner.knowledgebase.articles.bulkUpdate({ ids: [one.id, two.id], status: 'publish' });
    await owner.knowledgebase.articles.bulkUpdate({ ids: [one.id, two.id], categoryId: other.id });

    const moved = await owner.knowledgebase.articles.list({
      topicId: topic.id,
      ...rule('subject.categoryId', 'eq', other.id),
    });

    expect(moved.articles).toHaveLength(2);
    expect(moved.articles.every((row) => row.status === 'publish' && row.publishedAt)).toBe(true);
  });

  it('pages newest first by cursor and counts every match', async () => {
    const { owner, topic, category } = await topicWithCategory('org-kba-d');

    for (let index = 0; index < 52; index++)
      await owner.knowledgebase.articles.create({
        categoryId: category.id,
        title: `Article ${index}`,
      });

    const first = await owner.knowledgebase.articles.list({ topicId: topic.id });

    expect(first.totalCount).toBe(52);
    expect(first.articles).toHaveLength(50);
    expect(first.articles[0]?.title).toBe('Article 51');

    const rest = await owner.knowledgebase.articles.list({
      topicId: topic.id,
      cursor: first.nextCursor ?? undefined,
    });

    expect(rest.articles.map((row) => row.title)).toEqual(['Article 1', 'Article 0']);
    expect(rest.nextCursor).toBeNull();
  });

  it("refuses a reader's changes and hides another organisation's articles", async () => {
    const { owner, category } = await topicWithCategory('org-kba-e');

    const article = await owner.knowledgebase.articles.create({
      categoryId: category.id,
      title: 'Mine',
    });

    const reader = clientAs('org-kba-e', [PERMISSIONS.kbView], 'reader-kba-e');

    await expect(reader.knowledgebase.articles.get({ id: article.id })).resolves.toMatchObject({
      title: 'Mine',
    });
    await expect(
      reader.knowledgebase.articles.update({ id: article.id, title: 'Theirs' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const other = clientAs('org-kba-f');

    await expect(other.knowledgebase.articles.get({ id: article.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(
      other.knowledgebase.articles.create({ categoryId: category.id, title: 'Sneaky' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(other.knowledgebase.articles.remove({ ids: [article.id] })).resolves.toEqual({
      ids: [],
    });
  });
});
