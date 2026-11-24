import { setTimeout } from 'node:timers/promises';
import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';
import { tokenOf } from '../../messenger/session.ts';
import { publishScheduled } from '../articles.ts';

const messenger = serve('/api/public/messenger');

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
      attachments: [{ url: '/core/v1/files/terms-1/download', name: 'terms.pdf', size: 120 }],
    });

    // A file attaches only at the address core's storage gave it.
    for (const url of [
      '/proc/self/environ',
      'http://169.254.169.254/latest',
      'javascript:alert(1)',
    ])
      await expect(
        owner.knowledgebase.articles.create({
          categoryId: category.id,
          title: 'Leak',
          attachments: [{ url, name: 'x' }],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

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
      code: 'INVALID_FILTER',
      status: 400,
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

  it('searches published public articles by each word, best first, in every topic or one', async () => {
    const { owner, topic, category } = await topicWithCategory('org-kba-s');
    const guides = await owner.knowledgebase.topics.create({ title: 'Guides' });

    const setup = await owner.knowledgebase.categories.create({
      topicId: guides.id,
      title: 'Setup',
    });

    const write = (categoryId: string, title: string, content: string, draft = false) =>
      owner.knowledgebase.articles.create({
        categoryId,
        title,
        content,
        status: draft ? 'draft' : 'publish',
      });

    await write(category.id, 'Exports', '<p>Each contact goes in one file</p>');
    await write(category.id, 'Spreadsheets', '<p>You can import every contact at once</p>');
    await write(category.id, 'Import products', '<p>Upload a sheet</p>');
    await write(setup.id, 'Import contacts', '<p>Upload a CSV file</p>');
    await write(category.id, 'Import drafts', '<p>contact</p>', true);
    await write(category.id, 'Цаг захиалга', '<p>Үйлчилгээний цагийг онлайнаар авна</p>');

    await owner.knowledgebase.articles.create({
      categoryId: category.id,
      title: 'Import secrets',
      status: 'publish',
      isPrivate: true,
    });

    const found = async (input: { search: string; topicId?: string }) =>
      (await owner.knowledgebase.articles.search(input)).articles.map((row) => row.title);

    // Title hits come first, then more words, across topics; a draft or private article is left out.
    await expect(found({ search: 'IMPORT  contact?' })).resolves.toEqual([
      'Import contacts',
      'Import products',
      'Spreadsheets',
      'Exports',
    ]);
    await expect(found({ search: 'import contact', topicId: topic.id })).resolves.toEqual([
      'Import products',
      'Spreadsheets',
      'Exports',
    ]);
    await expect(found({ search: 'ЦАГ захиалга' })).resolves.toEqual(['Цаг захиалга']);
    await expect(found({ search: '%' })).resolves.toEqual([]);

    const [first] = (await owner.knowledgebase.articles.search({ search: 'csv' })).articles;

    expect(first).toMatchObject({ title: 'Import contacts', topicId: guides.id });
    expect(first).not.toHaveProperty('content');
    await expect(
      owner.knowledgebase.articles.search({ search: 'import', topicId: 'no-such-topic' }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      clientAs('org-kba-s2').knowledgebase.articles.search({ search: 'import' }),
    ).resolves.toEqual({ articles: [] });
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

    // Core's `knowledgebase.publish` job publishes it.
    await expect(owner.knowledgebase.articles.get({ id: article.id })).resolves.toMatchObject({
      status: 'scheduled',
    });
    await expect(publishScheduled('org-kba-b')).resolves.toEqual({ published: 1 });

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

  it('pages newest first by cursor, past a deleted last row, and counts every match', async () => {
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

    // The page's last row goes before the next page is read.
    await owner.knowledgebase.articles.remove({ ids: [first.articles.at(-1)?.id ?? ''] });

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

  it("counts each messenger visitor's one reaction to an article it offers", async () => {
    const orgId = 'org-kba-react';
    const { owner, topic, category } = await topicWithCategory(orgId);
    const [like = '', sad = ''] = ['like', 'sad'].map((name) => `https://icons.test/${name}.svg`);

    const article = await owner.knowledgebase.articles.create({
      categoryId: category.id,
      title: 'Refunds',
      status: 'publish',
      reactionChoices: [like, sad],
    });

    const channel = await owner.channels.create({ name: 'Support' });

    const integration = await owner.integrations.create({
      channelId: channel.id,
      kind: 'messenger',
      name: 'Website',
      config: { knowledgeBaseTopicId: topic.id },
    });

    const visitor = (customerId: string) =>
      tokenOf({
        orgId,
        integrationId: integration.id,
        customerId,
        identified: false,
        verified: false,
      });

    const [ann, bob] = await Promise.all([visitor('ann'), visitor('bob')]);
    const path = `/knowledge-base/articles/${article.id}`;

    const react = (token: string, choice: string | null) =>
      messenger.post(`${path}/reaction`, { choice }, token);

    expect((await messenger.get(path, ann)).body).toMatchObject({
      reactions: [
        { choice: like, count: 0, mine: false },
        { choice: sad, count: 0, mine: false },
      ],
    });

    await react(bob, like);
    // Ann changes her mind: one reaction each, the last one counts.
    await react(ann, sad);

    expect((await react(ann, like)).body).toEqual([
      { choice: like, count: 2, mine: true },
      { choice: sad, count: 0, mine: false },
    ]);
    expect((await react(bob, null)).body).toEqual([
      { choice: like, count: 1, mine: false },
      { choice: sad, count: 0, mine: false },
    ]);
    expect((await react(ann, 'https://icons.test/heart.svg')).status).toBe(400);
    await expect(owner.knowledgebase.articles.reactions({ id: article.id })).resolves.toEqual([
      { choice: like, count: 1 },
      { choice: sad, count: 0 },
    ]);

    // A draft takes no reactions.
    await owner.knowledgebase.articles.update({ id: article.id, status: 'draft' });
    expect((await react(ann, sad)).status).toBe(404);
  });
});
