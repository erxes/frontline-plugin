import express, { type NextFunction, type Request, type Response } from 'express';
import { config } from '#/config.ts';
import { fail } from '../../fail.ts';
import { LanguageCode } from '../../fields.ts';
import { pageOf } from '../paging.ts';
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

const publicHost = new URL(config.publicUrl).hostname;

/**
 * Where frontline's own routes live, in any case as Express matches them, which a help center's
 * host never serves. `/help/<key>` is not among them: on a help center's host it is that help
 * center's 404, so a member's domain never shows another organisation's site.
 */
const OWN_PATHS = /^\/(api|ui|widget|health)(\/|$)/i;

/**
 * Whose help center a request opens: the key in `/help/:key`, or its host, which is
 * `<key>.<HELPCENTER_DOMAIN_SUFFIX>` or a domain Cloudflare serves for it.
 */
const addressOf = (req: Request) => {
  const key = req.params.key;

  if (typeof key === 'string') return { address: key, base: `/help/${key}` };

  const suffix = `.${config.helpCenterDomainSuffix}`;
  const host = req.hostname.toLowerCase();

  return { address: host.endsWith(suffix) ? host.slice(0, -suffix.length) : host, base: '' };
};

/** The help centers a request's host opened, so its pages don't look it up again. */
const openedByHost = new WeakMap<Request, Center>();

/** Everything a page draws from: the help center's data, its words and its sanitized HTML. */
const siteFor = async (found: Center, base: string): Promise<Site> => {
  const { site: data, key } = await siteOf(found);
  const { headerHtml, footerHtml } = found.center.styles;
  // A language saved before the API checked it can't break the page.
  const language = LanguageCode.safeParse(found.center.languageCode).data ?? 'en';

  return {
    ...data,
    language,
    copy: copyOf(language),
    base,
    headerHtml: headerHtml ? visitorHtml(headerHtml, key) : '',
    footerHtml: footerHtml ? visitorHtml(footerHtml, key) : '',
  };
};

/**
 * Pages load only frontline's form and messenger embeds, images from anywhere, and no frames; the member's
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

/** A page of the site: `draw` gives its title and `main`, or null for the 404 page. */
const sitePage =
  (draw: (site: Site, req: Request, found: Center) => Drawn | Promise<Drawn>) =>
  async (req: Request, res: Response) => {
    try {
      const { address, base } = addressOf(req);
      const found = openedByHost.get(req) ?? (await centerAt(address));

      if (!found) {
        res.status(404).type('text/plain').send('No such help center');

        return;
      }

      const site = await siteFor(found, base);
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

const param = (req: Request, name: string) => {
  const value = req.params[name];

  return typeof value === 'string' ? value : '';
};

/** The site's pages, at `/help/:key` and at a help center's own host. */
const pages = express
  .Router({ mergeParams: true })
  .get('/', sitePage(home))
  .get(
    '/categories/:id',
    sitePage((site, req) => categoryPage(site, param(req, 'id'), pageOf(req))),
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

/**
 * A help center's site at its own host, ahead of every other route: a GET to any host but
 * frontline's own, outside frontline's paths, that opens a help center.
 */
export const siteByHost = async (req: Request, res: Response, next: NextFunction) => {
  if (
    (req.method !== 'GET' && req.method !== 'HEAD') ||
    !req.get('host') ||
    req.hostname === publicHost ||
    OWN_PATHS.test(req.path)
  ) {
    next();

    return;
  }

  try {
    const found = await centerAt(addressOf(req).address);

    if (!found) {
      next();

      return;
    }

    openedByHost.set(req, found);
    pages(req, res, next);
  } catch (error) {
    fail(res, error, 'help center host');
  }
};
