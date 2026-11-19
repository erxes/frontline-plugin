import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';
import type * as FilesModule from '../../files.ts';
import { tokenOf } from '../../messenger/session.ts';
import { flushViews } from '../../views.ts';
import { publishedSite, SANITIZED } from './published.ts';

// Core's storage: any file it is asked for, as an image.
vi.mock('#/modules/files.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof FilesModule>()),
  readFile: async () => {
    const body = new Blob(['png']);

    return { name: 'a.png', contentType: 'image/png', size: body.size, body: body.stream() };
  },
}));

const messenger = serve('/api/public/messenger');

const publicApi = serve('/api/public');

/** A file on core's storage, at the address core gives it. */
const file = (id: string) => ({ url: `/core/v1/files/${id}/download`, name: `${id}.png` });

describe('help centers', () => {
  it('serves its published public articles to any website by its key, their HTML sanitized', async () => {
    const { center, article } = await publishedSite('org-hc-a');

    expect(center.publicKey).toMatch(/^[0-9a-f]{20}$/);
    expect(center.cnameTarget).toBe(`${center.publicKey}.helpcenter.erxes.io`);
    expect(center.scriptUrl).toBe(
      `http://localhost:3399/widget/knowledgebase.js?key=${center.publicKey}`,
    );

    const site = await fetch(`${publicApi.url('')}/help-centers/${center.publicKey}`, {
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

    const read = await fetch(
      `${publicApi.url('')}/help-centers/${center.publicKey}/articles/${article.id}`,
    );

    await expect(read.json()).resolves.toMatchObject({ content: SANITIZED, viewCount: 0 });

    // Search reads the text without its tags or entities, and a draft, a private article or a wildcard in
    // the words finds nothing.
    const search = async (q: string) =>
      (await fetch(`${publicApi.url('')}/help-centers/${center.publicKey}/search?q=${q}`)).json();

    await expect(search('fees%20%26%20REFUNDS')).resolves.toEqual([
      expect.objectContaining({ id: article.id, title: 'Refunds' }),
    ]);

    for (const missed of ['onclick', 'Draft', 'Internal', 'M_ney'])
      await expect(search(missed)).resolves.toEqual([]);

    expect(
      (await fetch(`${publicApi.url('')}/help-centers/${center.publicKey}/search?q=`)).status,
    ).toBe(400);

    // The view is written with the others that came meanwhile. Visitors see the count once the
    // topic they read leaves the 30 s cache.
    await flushViews();
    await expect(
      clientAs('org-hc-a').knowledgebase.articles.get({ id: article.id }),
    ).resolves.toMatchObject({ viewCount: 1 });
    expect((await fetch(`${publicApi.url('')}/help-centers/unknown-key`)).status).toBe(404);
  });

  it("doesn't serve another topic's articles, and stops serving a deleted help center", async () => {
    const { owner, center } = await publishedSite('org-hc-b');
    const other = await publishedSite('org-hc-c');
    const theirs = `${publicApi.url('')}/help-centers/${center.publicKey}/articles/${other.article.id}`;

    expect((await fetch(theirs)).status).toBe(404);

    await owner.helpCenters.remove({ ids: [center.id] });

    expect((await fetch(`${publicApi.url('')}/help-centers/${center.publicKey}`)).status).toBe(404);
    await expect(owner.helpCenters.list({})).resolves.toEqual({
      helpCenters: [],
      nextCursor: null,
      totalCount: 0,
      canManage: true,
    });
  });

  it('offers the active forms it picks, in order, and forgets a deleted one', async () => {
    const { owner, center } = await publishedSite('org-hc-f');
    const channel = await owner.channels.create({ name: 'Leads' });
    const quote = await owner.forms.create({ channelId: channel.id, name: 'Quote', title: 'Ask' });
    const demo = await owner.forms.create({ channelId: channel.id, name: 'Demo' });
    const old = await owner.forms.create({ channelId: channel.id, name: 'Old' });

    await expect(
      owner.helpCenters.update({ id: center.id, formIds: [demo.id, 'no-such-form'] }),
    ).rejects.toThrow('Pick forms that still exist');

    const saved = await owner.helpCenters.update({
      id: center.id,
      formIds: [demo.id, quote.id, old.id, demo.id],
    });

    expect(saved.formIds).toEqual([demo.id, quote.id, old.id]);

    await owner.forms.setStatus({ ids: [old.id], status: 'archived' });

    const embed = await owner.forms.embed({ id: demo.id });

    // An array matches only with as many items, so the archived form is left out.
    await expect(
      (await fetch(`${publicApi.url('')}/help-centers/${center.publicKey}`)).json(),
    ).resolves.toMatchObject({
      forms: [
        { id: demo.id, name: 'Demo', url: embed.url, scriptUrl: embed.scriptUrl },
        { id: quote.id, title: 'Ask', code: quote.code },
      ],
    });

    await owner.forms.remove({ ids: [quote.id] });

    await expect(owner.helpCenters.get({ id: center.id })).resolves.toMatchObject({
      formIds: [demo.id, old.id],
    });
    await expect(owner.helpCenters.list({ limit: 1 })).resolves.toMatchObject({
      helpCenters: [{ id: center.id, formIds: [demo.id, old.id] }],
      totalCount: 1,
    });
  });

  const Site = z.object({ helpCenter: z.object({ styles: z.object({ mainLogo: z.string() }) }) });

  it('serves the files it shows visitors through its own address, and no other file', async () => {
    const { owner, center, article } = await publishedSite('org-hc-files');

    await owner.knowledgebase.articles.update({
      id: article.id,
      content: `<p>Steps</p><img src="${file('shot').url}"><a href="https://cloud.acme.test/files/report/download">Report</a>`,
      image: file('cover'),
      attachments: [file('guide')],
    });
    await owner.knowledgebase.articles.create({
      categoryId: article.categoryId,
      title: 'Internal',
      status: 'publish',
      isPrivate: true,
      image: file('secret'),
    });
    await owner.knowledgebase.articles.create({
      categoryId: article.categoryId,
      title: 'Soon',
      image: file('draft'),
    });
    await owner.helpCenters.update({
      id: center.id,
      backgroundImage: file('hero').url,
      styles: { mainLogo: file('logo').url, favicon: file('icon').url },
      footer: { logo: file('foot').url },
    });

    const channel = await owner.channels.create({ name: 'Web' });

    const integration = await owner.integrations.create({
      channelId: channel.id,
      kind: 'messenger',
      name: 'Website',
      config: { logo: file('badge').url },
    });

    const site: unknown = await (
      await fetch(`${publicApi.url('')}/help-centers/${center.publicKey}`)
    ).json();

    const shown = Site.parse(site).helpCenter.styles.mainLogo.replace(/logo$/, '');

    expect(shown).toMatch(/^http:\/\/localhost:3399\/api\/public\/files\/[\w-]+\/$/);
    expect(site).toMatchObject({
      helpCenter: {
        backgroundImage: `${shown}hero`,
        styles: { favicon: `${shown}icon` },
        footer: { logo: `${shown}foot` },
      },
    });

    const read = await fetch(
      `${publicApi.url('')}/help-centers/${center.publicKey}/articles/${article.id}`,
    );

    await expect(read.json()).resolves.toMatchObject({
      content: `<p>Steps</p><img src="${shown}shot" /><a href="https://cloud.acme.test/files/report/download" target="_blank" rel="noreferrer">Report</a>`,
      image: { url: `${shown}cover`, name: 'cover.png' },
      attachments: [{ url: `${shown}guide`, name: 'guide.png' }],
    });

    const opened = await messenger.get(`/settings?key=${integration.publicKey}`);

    expect(opened.body).toMatchObject({ messenger: { logo: `${shown}badge` } });

    const statusOf = async (prefix: string, id: string) =>
      (await fetch(`${prefix.replace('http://localhost:3399/api/public', publicApi.url(''))}${id}`))
        .status;

    const ids = ['logo', 'icon', 'foot', 'hero', 'shot', 'cover', 'guide', 'badge'];
    const refused = ['secret', 'draft', 'report', 'elsewhere'];

    const statuses = await Promise.all(
      [...ids, ...refused].map(async (id) => [id, await statusOf(shown, id)]),
    );

    expect(Object.fromEntries(statuses)).toEqual({
      ...Object.fromEntries(ids.map((id) => [id, 200])),
      ...Object.fromEntries(refused.map((id) => [id, 404])),
    });

    // Another organisation's key opens its own files, never these.
    const other = await publishedSite('org-hc-files-b');

    await other.owner.helpCenters.update({
      id: other.center.id,
      styles: { mainLogo: file('theirs').url },
    });

    const theirSite = await fetch(`${publicApi.url('')}/help-centers/${other.center.publicKey}`);

    const theirs = Site.parse(await theirSite.json()).helpCenter.styles.mainLogo.replace(
      /theirs$/,
      '',
    );

    expect(theirs).not.toBe(shown);
    expect(await statusOf(theirs, 'theirs')).toBe(200);
    expect(await statusOf(theirs, 'logo')).toBe(404);
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
        verified: false,
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
    expect((await messenger.get('/knowledge-base/search?q=money', offered)).body).toMatchObject([
      { id: article.id },
    ]);
    expect((await messenger.get('/knowledge-base', await visitorOf({}))).status).toBe(404);
  });

  it('refuses a domain where Cloudflare is off, and one under erxes.io', async () => {
    const { owner, center } = await publishedSite('org-hc-d');

    expect(center.domainsAvailable).toBe(false);

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
