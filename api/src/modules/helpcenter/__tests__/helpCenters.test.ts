import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { createApp } from '#/server.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';
import { tokenOf } from '../../messenger/session.ts';

const messenger = serve('/api/public/messenger');

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

/** The published article's body as visitors get it: no handlers, scripts or script links. */
const SANITIZED =
  '<p>Money back</p><a target="_blank" rel="noreferrer">Terms</a><a href="https://acme.test/refunds" target="_blank" rel="noreferrer">Policy</a>';

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
    content:
      '<p onclick="steal()">Money back</p><script>steal()</script><a href="javascript:steal()">Terms</a><a href="https://acme.test/refunds">Policy</a>',
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

  return { owner, topic, center, article };
};

describe('help centers', () => {
  it('serves its published public articles to any website by its key, their HTML sanitized', async () => {
    const { center, article } = await publishedSite('org-hc-a');

    expect(center.publicKey).toMatch(/^[0-9a-f]{20}$/);
    expect(center.cnameTarget).toBe(`${center.publicKey}.helpcenter.erxes.io`);
    expect(center.scriptUrl).toBe(
      `http://localhost:3399/widget/knowledgebase.js?key=${center.publicKey}`,
    );

    const site = await fetch(`${base}/help-centers/${center.publicKey}`, {
      headers: { origin: 'https://shop.test' },
    });

    expect(site.status).toBe(200);
    expect(site.headers.get('access-control-allow-origin')).toBe('*');
    await expect(site.json()).resolves.toMatchObject({
      helpCenter: { title: 'Acme help' },
      topic: { title: 'Help' },
      categories: [{ title: 'Billing' }],
      articles: [{ id: article.id, title: 'Refunds', viewCount: 0 }],
    });

    const read = await fetch(`${base}/help-centers/${center.publicKey}/articles/${article.id}`);

    await expect(read.json()).resolves.toMatchObject({
      content: SANITIZED,
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
    await expect(owner.helpCenters.list({})).resolves.toEqual({ helpCenters: [], canManage: true });
  });

  it("gives a messenger's visitors the topic it offers, and nothing when it offers none", async () => {
    const { owner, topic, article } = await publishedSite('org-hc-ms');
    const channel = await owner.channels.create({ name: 'Support' });

    const visitorOf = async (config: Record<string, unknown>) => {
      const integration = await owner.integrations.create({
        channelId: channel.id,
        kind: 'messenger',
        name: 'Website',
        config,
      });

      return tokenOf({
        orgId: 'org-hc-ms',
        integrationId: integration.id,
        customerId: 'ann',
        identified: false,
      });
    };

    const offered = await visitorOf({ knowledgeBaseTopicId: topic.id });

    expect((await messenger.get('/knowledge-base', offered)).body).toMatchObject({
      topic: { title: 'Help' },
      articles: [{ id: article.id, title: 'Refunds' }],
    });
    expect(
      (await messenger.get(`/knowledge-base/articles/${article.id}`, offered)).body,
    ).toMatchObject({ title: 'Refunds', content: SANITIZED });
    expect((await messenger.get('/knowledge-base', await visitorOf({}))).status).toBe(404);
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
