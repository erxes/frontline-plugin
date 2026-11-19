import { get } from 'node:http';
import { describe, expect, it } from 'vite-plus/test';
import { serve } from '#/test/http.ts';
import { publishedSite, SANITIZED } from './published.ts';

const app = serve('');

/** A page at `url`, asked for as `host`, through node:http since fetch won't send another Host. */
const pageAt = (url: string, host?: string) =>
  new Promise<{ status: number; type: string; body: string }>((resolve, reject) => {
    get(url, { headers: host ? { host } : {} }, (reply) => {
      let body = '';

      reply.setEncoding('utf8');
      reply.on('data', (chunk: string) => (body += chunk));
      reply.on('end', () =>
        resolve({
          status: reply.statusCode ?? 0,
          type: reply.headers['content-type'] ?? '',
          body,
        }),
      );
    }).on('error', reject);
  });

describe("a help center's site", () => {
  it('serves its site at its key and at its own host: home, article, search, 404, in its language', async () => {
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

    // At `<key>.<HELPCENTER_DOMAIN_SUFFIX>`, the same pages sit at the root.
    const own = await pageAt(`${origin}/`, `${center.publicKey}.helpcenter.erxes.io`);

    expect(own.status).toBe(200);
    expect(own.body).toContain(`href="/articles/${article.id}"`);
    // Its host never serves another help center by key.
    expect(
      (
        await pageAt(
          `${origin}/help/${center.publicKey}`,
          `${center.publicKey}.helpcenter.erxes.io`,
        )
      ).status,
    ).toBe(404);
    expect((await pageAt(`${origin}/`, 'unknown.example')).status).toBe(404);
  });
});
