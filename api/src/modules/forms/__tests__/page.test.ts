import { describe, expect, it } from 'vite-plus/test';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';

const app = serve('');

/** The link page's address on this test server, from the embed address `forms.embed` gives. */
const pageOf = async (client: ReturnType<typeof clientAs>, id: string) => {
  const { url } = await client.forms.embed({ id });
  const [, , , key, , code] = new URL(url).pathname.split('/');

  return { key, code, page: app.url(`/forms/${key}/${code}`) };
};

describe("a form's link page", () => {
  it('serves a page that loads the form embed, and carries the link token through', async () => {
    const owner = clientAs('org-fp-a');
    const channel = await owner.channels.create({ name: 'Sales' });

    const form = await owner.forms.create({
      channelId: channel.id,
      name: 'Demo <script>alert(1)</script>',
    });

    const { key, code, page } = await pageOf(owner, form.id);
    const asked = await fetch(page);

    expect(asked.status).toBe(200);
    expect(asked.headers.get('content-type')).toContain('text/html');
    expect(asked.headers.get('cache-control')).toBe('no-store');

    const body = await asked.text();

    expect(body).toContain('<title>Demo &lt;script&gt;alert(1)&lt;/script&gt;</title>');
    expect(body).not.toContain('alert(1)</title>');
    expect(body).toContain(`data-frontline-form="${code}"`);
    expect(body).toContain('/widget/form.js?');
    expect(body).toContain(`key=${key}`);
    expect(body).toContain(`code=${code}`);

    const linked = await fetch(`${page}?link=token-abc`);

    expect(await linked.text()).toContain('link=token-abc');
    expect((await fetch(page)).status).toBe(200);
    expect((await fetch(`${app.url('')}/forms/${key}/deadbeef`)).status).toBe(404);
    expect((await fetch(`${app.url('')}/forms/forged/${code}`)).status).toBe(404);

    await owner.forms.setStatus({ ids: [form.id], status: 'archived' });

    expect((await fetch(page)).status).toBe(404);
  });
});
