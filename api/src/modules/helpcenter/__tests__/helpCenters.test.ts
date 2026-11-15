import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { createApp } from '#/server.ts';
import { clientAs } from '#/test/member.ts';

let base = '';
let server: ReturnType<ReturnType<typeof createApp>['listen']>;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = createApp().listen(0, () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === 'string') throw new Error('not listening on a port');

  base = `http://127.0.0.1:${address.port}/api/public`;
});

afterAll(() => {
  server.close();
});

/** A help center over a topic with one published article, one draft and one private. */
const publishedSite = async (orgId: string) => {
  const owner = clientAs(orgId);
  const topic = await owner.knowledgebase.topics.create({ title: 'Help' });

  const category = await owner.knowledgebase.categories.create({
    topicId: topic.id,
    title: 'Billing',
  });

  const article = await owner.knowledgebase.articles.create({
    categoryId: category.id,
    title: 'Refunds',
    content: '<p>Money back</p>',
    status: 'publish',
  });

  await owner.knowledgebase.articles.create({ categoryId: category.id, title: 'Draft' });

  await owner.knowledgebase.articles.create({
    categoryId: category.id,
    title: 'Internal',
    status: 'publish',
    isPrivate: true,
  });

  const center = await owner.helpCenters.create({ title: 'Acme help', kbTopicId: topic.id });

  return { owner, center, article };
};

describe('help centers', () => {
  it('serves its published public articles to signed-out visitors by its key', async () => {
    const { center, article } = await publishedSite('org-hc-a');

    expect(center.publicKey).toMatch(/^[0-9a-f]{20}$/);
    expect(center.cnameTarget).toBe(`${center.publicKey}.helpcenter.erxes.io`);

    const site = await fetch(`${base}/help-centers/${center.publicKey}`);

    expect(site.status).toBe(200);
    await expect(site.json()).resolves.toMatchObject({
      helpCenter: { title: 'Acme help' },
      topic: { title: 'Help' },
      categories: [{ title: 'Billing' }],
      articles: [{ id: article.id, title: 'Refunds', viewCount: 0 }],
    });

    const read = await fetch(`${base}/help-centers/${center.publicKey}/articles/${article.id}`);

    await expect(read.json()).resolves.toMatchObject({
      content: '<p>Money back</p>',
      viewCount: 1,
    });
    expect((await fetch(`${base}/help-centers/unknown-key`)).status).toBe(404);
  });

  it("doesn't serve another topic's articles, and stops serving a deleted help center", async () => {
    const { owner, center } = await publishedSite('org-hc-b');
    const other = await publishedSite('org-hc-c');
    const theirs = `${base}/help-centers/${center.publicKey}/articles/${other.article.id}`;

    expect((await fetch(theirs)).status).toBe(404);

    await owner.helpCenters.remove({ ids: [center.id] });

    expect((await fetch(`${base}/help-centers/${center.publicKey}`)).status).toBe(404);
    await expect(owner.helpCenters.list({})).resolves.toEqual([]);
  });

  it('resolves only domains Cloudflare serves, and refuses one where Cloudflare is off', async () => {
    const { owner, center } = await publishedSite('org-hc-d');

    expect(center.domainsAvailable).toBe(false);
    expect((await fetch(`${base}/custom-domains/resolve?host=help.acme.test`)).status).toBe(404);
    expect((await fetch(`${base}/custom-domains/resolve?host=${center.publicKey}`)).status).toBe(
      404,
    );

    await expect(
      owner.helpCenters.domain.save({ id: center.id, hostname: 'https://Help.Acme.test/' }),
    ).rejects.toThrow('Custom domains are not available on this installation');
    await expect(
      owner.helpCenters.domain.save({ id: center.id, hostname: 'help.erxes.io' }),
    ).rejects.toThrow("Domains under erxes.io cannot be a help center's domain");
  });

  it('lets viewers read help centers and only managers change them', async () => {
    const { center } = await publishedSite('org-hc-e');
    const viewer = clientAs('org-hc-e', [PERMISSIONS.helpCenterView], 'viewer');

    await expect(viewer.helpCenters.get({ id: center.id })).resolves.toMatchObject({
      title: 'Acme help',
    });
    await expect(viewer.helpCenters.update({ id: center.id, title: 'Ours' })).rejects.toMatchObject(
      {
        code: 'FORBIDDEN',
      },
    );
  });
});
