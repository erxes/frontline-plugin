import type { Request, Response } from 'express';
import { html, raw } from 'hono/html';
import { z } from 'zod';
import { withOrg } from '#/db/client.ts';
import { fail } from '../fail.ts';
import { activeForm, keyed } from './embed.ts';

/**
 * The link page's policy: same-origin script and calls (the embed's script and API live here),
 * the shadow root's inline stylesheet, and framing allowed, since a site may iframe its form.
 */
const PAGE_SECURITY = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "connect-src 'self'",
    "style-src 'unsafe-inline'",
    'img-src * data:',
    "object-src 'none'",
    "base-uri 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

/** The page's own look: the embed draws the form, this centres its column. */
const PAGE_CSS = `
  body { margin: 0; min-height: 100vh; background: #f1f5f9; font-family: system-ui, sans-serif; }
  #main { box-sizing: border-box; width: 100%; max-width: 720px; margin: 0 auto; padding: 48px 24px; }
  .fp-gone { text-align: center; color: #334155; }
`;

const linkDocument = async (title: string, language: string, main: ReturnType<typeof html>) =>
  String(
    await html`<!doctype html>
      <html lang="${language}">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>${title}</title>
          <style>
            ${raw(PAGE_CSS)}
          </style>
        </head>
        <body>
          <main id="main">${main}</main>
        </body>
      </html>`,
  );

/**
 * The page a form link opens, `GET /forms/:key/:code?link=<token>` on the widgets domain: the
 * form embed, drawn in place, with the link's token in the script's address so the answer it
 * sends is the link's own. A bad key, code or archived form is the same gone page.
 */
export const formLinkPage = async (req: Request, res: Response) => {
  try {
    const route = await keyed(req);

    const found =
      route && (await withOrg(route.organizationId, (tx) => activeForm(tx, route.code)));

    res.set(PAGE_SECURITY);

    if (!route || !found) {
      res
        .status(404)
        .type('html')
        .send(
          await linkDocument(
            'No such form',
            'en',
            html`<div class="fp-gone">
              <h1>No such form</h1>
              <p>Check the address you were given.</p>
            </div>`,
          ),
        );

      return;
    }

    const query = new URLSearchParams({ key: route.key, code: route.code });
    const link = z.string().max(4000).safeParse(req.query.link);

    if (link.success) query.set('link', link.data);

    // The address can carry a one-time token, so no cache keeps the page.
    res.set('cache-control', 'no-store');
    res.type('html').send(
      await linkDocument(
        found.form.title || found.form.name,
        found.form.languageCode ?? 'en',
        html`<div data-frontline-form="${route.code}"></div>
          <noscript><p>Enable JavaScript to answer this form.</p></noscript>
          <script type="module" src="/widget/form.js?${query}"></script>`,
      ),
    );
  } catch (error) {
    fail(res, error, 'form link page');
  }
};
