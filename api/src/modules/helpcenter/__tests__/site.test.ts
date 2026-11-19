import { describe, expect, it } from 'vite-plus/test';
import { serve } from '#/test/http.ts';
import { publishedSite, SANITIZED } from './published.ts';

const app = serve('');

/** A page of a help center's site at `url`. */
const pageAt = async (url: string) => {
  const reply = await fetch(url);

  return {
    status: reply.status,
    type: reply.headers.get('content-type') ?? '',
    body: await reply.text(),
  };
};

describe("a help center's site", () => {
  it('serves its site at its key: home, article, search, 404, in its language', async () => {
    const { owner, center, article } = await publishedSite('org-hc-site');
    const origin = app.url('');
    const site = `${origin}/help/${center.publicKey}`;
    const home = await pageAt(site);

    expect(home).toMatchObject({ status: 200, type: 'text/html; charset=utf-8' });
    expect(home.body).toContain('<title>Acme help</title>');
    expect(home.body).toContain(`href="/help/${center.publicKey}/articles/${article.id}"`);
    expect(home.body).not.toContain('>Draft<');
    expect(home.body).not.toContain('Internal');

    const read = await pageAt(`${site}/articles/${article.id}`);

    expect(read.body).toContain('<title>Refunds · Acme help</title>');
    expect(read.body).toContain(SANITIZED);
    expect(read.body).not.toContain('steal()');

    expect((await pageAt(`${site}/search?q=refunds`)).body).toContain(`/articles/${article.id}"`);
    expect((await pageAt(`${site}/search?q=shipping`)).body).toContain('No articles match');
    const missing = await pageAt(`${site}/articles/no-such-article`);

    expect(missing.status).toBe(404);
    expect(missing.body).toContain('This page does not exist.');
    expect((await pageAt(`${origin}/help/no-such-key`)).status).toBe(404);

    // A language is a two-letter code, which the site's words, dates and `lang` follow.
    await expect(
      owner.helpCenters.update({ id: center.id, languageCode: 'en_US' }),
    ).rejects.toThrow('Input validation failed');
    await owner.helpCenters.update({ id: center.id, languageCode: 'mn' });

    const mongolian = await pageAt(`${site}/articles/${article.id}`);

    expect(mongolian.status).toBe(200);
    expect(mongolian.body).toContain('<html lang="mn">');
  });
});
