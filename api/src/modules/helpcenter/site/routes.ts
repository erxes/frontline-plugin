import express, { type Request, type Response } from 'express';
import { config } from '#/config.ts';
import { fail } from '../../fail.ts';
import { shownKeyOf } from '../../shownFiles.ts';
import { articleOf, type Center, centerAt, siteOf, visitorHtml } from '../public.ts';
import { copyOf } from './copy.ts';
import { page, type Site } from './layout.ts';
import {
  articlePage,
  categoryPage,
  type Drawn,
  formPage,
  formsPage,
  home,
  notFoundPage,
  searchPage,
} from './pages.ts';

/** Everything a page draws from: the help center's data, its words and its sanitized HTML. */
const siteFor = async (found: Center, base: string): Promise<Site> => {
  const [data, key] = await Promise.all([siteOf(found), shownKeyOf(found.orgId)]);
  const { headerHtml, footerHtml } = found.center.styles;

  return {
    ...data,
    copy: copyOf(data.helpCenter.languageCode),
    base,
    headerHtml: headerHtml ? visitorHtml(headerHtml, key) : '',
    footerHtml: footerHtml ? visitorHtml(footerHtml, key) : '',
  };
};

/**
 * Pages load only frontline's form embed, images from anywhere, and no frames; the member's
 * HTML is sanitized before it gets here.
 */
const SECURITY = {
  'content-security-policy': [
    "default-src 'self'",
    `script-src ${config.publicUrl}`,
    `connect-src ${config.publicUrl}`,
    "style-src 'unsafe-inline'",
    'img-src * data:',
    "frame-ancestors 'none'",
    "base-uri 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
};

const param = (req: Request, name: string) => {
  const value = req.params[name];

  return typeof value === 'string' ? value : '';
};

/** A page of the site: `draw` gives its title and `main`, or null for the 404 page. */
const sitePage =
  (draw: (site: Site, req: Request, found: Center) => Drawn | Promise<Drawn>) =>
  async (req: Request, res: Response) => {
    try {
      const key = param(req, 'key');
      const found = await centerAt(key);

      if (!found) {
        res.status(404).type('text/plain').send('No such help center');

        return;
      }

      const site = await siteFor(found, `/help/${key}`);
      const drawn = await draw(site, req, found);

      res.set(SECURITY);
      res.set('cache-control', 'public, max-age=60');

      if (!drawn) {
        res
          .status(404)
          .type('html')
          .send(await page(site, site.copy.notFound, notFoundPage(site)));

        return;
      }

      res.type('html').send(await page(site, drawn.title, drawn.main, drawn.description));
    } catch (error) {
      fail(res, error, 'help center site');
    }
  };

/** The site's pages, under `/help/:key`. */
const pages = express
  .Router({ mergeParams: true })
  .get('/', sitePage(home))
  .get(
    '/categories/:id',
    sitePage((site, req) => categoryPage(site, param(req, 'id'))),
  )
  .get(
    '/articles/:id',
    sitePage(async (site, req, { orgId, center }) => {
      const article = await articleOf(orgId, center.kbTopicId ?? '', param(req, 'id'));

      return article && articlePage(site, article);
    }),
  )
  .get(
    '/search',
    sitePage((site, req) =>
      searchPage(site, typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : ''),
    ),
  )
  .get('/forms', sitePage(formsPage))
  .get(
    '/forms/:id',
    sitePage((site, req) => formPage(site, param(req, 'id'))),
  )
  .use(sitePage(() => null));

/** A help center's site by its key: `/help/:key/…` on frontline's own address. */
export const siteByKey = () => express.Router().use('/help/:key', pages);
