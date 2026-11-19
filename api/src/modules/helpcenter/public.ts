import { and, eq, inArray } from 'drizzle-orm';
import express, { type Response, type Router } from 'express';
import sanitizeHtml from 'sanitize-html';
import { type Tx, withOrg } from '#/db/client.ts';
import { forms } from '#/db/forms.ts';
import { HELP_CENTER_DOMAIN, HELP_CENTER_KEY, helpCenters } from '#/db/helpcenter.ts';
import { integrations } from '#/db/inbox.ts';
import { publicKeys } from '#/db/public.ts';
import { kbArticles, kbCategories } from '#/db/schema.ts';
import type { Attachment } from '#/db/table.ts';
import { fail } from '../fail.ts';
import { urlOf } from '../forms/embed.ts';
import { INTEGRATION_KEY } from '../inbox/insertIntegration.ts';
import { messenger } from '../messenger/adapter.ts';
import { pageOf } from './paging.ts';
import { categoryArticlesOf, SearchQuery, searchOf, type shelvesOf, topicIn } from './topic.ts';
import { keyOfOrganization, openedBy, widgetScript } from '../public.ts';
import { countView } from '../views.ts';
import { published, shownFile, shownUrl } from '../shownFiles.ts';

/**
 * The help center's organisation and id from the address a signed-out visitor came by: its key,
 * or its domain once Cloudflare serves it.
 */
export const centerAt = async (address: string) => {
  const found = await openedBy(address.toLowerCase(), [HELP_CENTER_KEY, HELP_CENTER_DOMAIN]);

  if (!found) return null;

  return withOrg(found.orgOf, async (tx) => {
    const [center] = await tx.select().from(helpCenters).where(eq(helpCenters.id, found.targetId));

    const served =
      center &&
      (found.kind === HELP_CENTER_KEY ||
        (center.domainStatus === 'active' && center.sslStatus === 'active'));

    return served ? { orgId: found.orgOf, center } : null;
  });
};

export type Center = NonNullable<Awaited<ReturnType<typeof centerAt>>>;

/**
 * An article's HTML as a visitor's page may show it: sanitize-html's default formatting tags,
 * plus images, with links opening in a new tab.
 */
export const visitorHtml = (html: string, key: string) => {
  /** The tag with its `name` attribute's core file at the address a visitor loads it from. */
  const shown = (attribs: sanitizeHtml.Attributes, name: string) => {
    const url = attribs[name];

    return url ? { ...attribs, [name]: shownUrl(key, url) } : attribs;
  };

  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img'],
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...shown(attribs, 'href'), target: '_blank', rel: 'noreferrer' },
      }),
      img: (tagName, attribs) => ({ tagName, attribs: shown(attribs, 'src') }),
    },
  });
};

/** A stored file at the address a visitor loads it from. */
const shownAttachment = (key: string, file: Attachment) => ({
  ...file,
  url: shownUrl(key, file.url),
});

/**
 * The active forms of `ids`, in their order, with where an embed reads each and its script, by
 * the organisation's `key`.
 */
const formsIn = async (tx: Tx, key: string, ids: string[]) => {
  if (ids.length === 0) return [];

  const rows = await tx
    .select({
      id: forms.id,
      name: forms.name,
      title: forms.title,
      description: forms.description,
      code: forms.code,
    })
    .from(forms)
    .where(and(inArray(forms.id, ids), eq(forms.status, 'active')));

  return rows
    .toSorted((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
    .map((row) => ({
      ...row,
      url: urlOf(key, row.code),
      scriptUrl: widgetScript('form', { key, code: row.code }),
    }));
};

/** The script of the help center's messenger, while it is an active messenger. */
const messengerScriptIn = async (tx: Tx, id: string | null) => {
  if (!id) return null;

  const [row] = await tx
    .select({ key: publicKeys.key })
    .from(integrations)
    .innerJoin(
      publicKeys,
      and(eq(publicKeys.kind, INTEGRATION_KEY), eq(publicKeys.targetId, integrations.id)),
    )
    .where(
      and(
        eq(integrations.id, id),
        eq(integrations.kind, messenger.kind),
        eq(integrations.isActive, true),
      ),
    );

  return row ? widgetScript('messenger', { key: row.key }) : null;
};

/**
 * What a visitor sees of the help center, read in one transaction: its look, with its images
 * where a visitor loads them, its topic's published articles and its forms. `key` is the
 * organisation's key its files show by.
 */
export const siteOf = ({ orgId, center }: Center) =>
  withOrg(orgId, async (tx) => {
    const key = await keyOfOrganization(tx, orgId);
    const shown = (url: string | null | undefined) => url && shownUrl(key, url);

    return {
      key,
      site: {
        helpCenter: {
          title: center.title,
          description: center.description,
          languageCode: center.languageCode,
          kbLabel: center.kbLabel,
          color: center.color,
          backgroundImage: shown(center.backgroundImage),
          styles: {
            ...center.styles,
            mainLogo: shown(center.styles.mainLogo),
            favicon: shown(center.styles.favicon),
          },
          header: center.header,
          footer: { ...center.footer, logo: shown(center.footer.logo) },
        },
        ...(await topicIn(tx, orgId, center.kbTopicId ?? '')),
        forms: await formsIn(tx, key, center.formIds),
        messengerScript: await messengerScriptIn(tx, center.messengerId),
      },
    };
  });

/**
 * One published public article of the topic, its body sanitized and its files where a visitor
 * loads them, counted as viewed. The view is written later with others (`flushViews`), so
 * `viewCount` is what was written so far.
 */
export const articleOf = async (orgId: string, topicId: string, id: string) => {
  const found = await withOrg(orgId, async (tx) => {
    const [article] = await tx
      .select({
        id: kbArticles.id,
        categoryId: kbArticles.categoryId,
        title: kbArticles.title,
        summary: kbArticles.summary,
        content: kbArticles.content,
        image: kbArticles.image,
        attachments: kbArticles.attachments,
        viewCount: kbArticles.viewCount,
        publishedAt: kbArticles.publishedAt,
      })
      .from(kbArticles)
      .innerJoin(kbCategories, eq(kbCategories.id, kbArticles.categoryId))
      .where(and(eq(kbArticles.id, id), published, eq(kbCategories.topicId, topicId)));

    return article && { article, key: await keyOfOrganization(tx, orgId) };
  });

  if (!found) return null;

  const { article, key } = found;

  countView(orgId, 'article', article.id);

  return {
    ...article,
    content: visitorHtml(article.content, key),
    image: article.image && shownAttachment(key, article.image),
    attachments: article.attachments.map((file) => shownAttachment(key, file)),
  };
};

/** What a topic gives a visitor, for the embeds to type their replies. */
export type VisitorTopic = Awaited<ReturnType<typeof shelvesOf>>;

/** One page of a category's articles, as the embeds list it. */
export type ArticlePage = NonNullable<Awaited<ReturnType<typeof categoryArticlesOf>>>;

export type VisitorArticle = NonNullable<Awaited<ReturnType<typeof articleOf>>>;

/** What the help center's site pages draw from: its look, its topic with every article, its forms. */
export type SiteData = Awaited<ReturnType<typeof siteOf>>['site'];

/** The help center as its embed reads it: the site without the articles, which it pages. */
export type VisitorSite = Omit<SiteData, 'articles'>;

const notFound = (res: Response, message: string) => {
  res.status(404).json({ message });
};

/**
 * The signed-out routes under `/api/public`: a help center's site data and articles by its key or
 * domain, for its knowledge base embed, and the files those show.
 */
export const publicRouter = (): Router => {
  const router = express.Router();

  router.get('/help-centers/:address', async (req, res) => {
    const found = await centerAt(req.params.address);

    if (!found) return notFound(res, 'No such help center');

    const { articles, ...site } = (await siteOf(found)).site;

    res.set('cache-control', 'public, max-age=60');
    res.json(site satisfies VisitorSite);
  });

  router.get('/help-centers/:address/categories/:id/articles', async (req, res) => {
    const found = await centerAt(req.params.address);

    const page =
      found &&
      (await categoryArticlesOf(
        found.orgId,
        found.center.kbTopicId ?? '',
        req.params.id,
        pageOf(req),
      ));

    if (!page) return notFound(res, 'No such page of articles');

    res.json(page);
  });

  router.get('/help-centers/:address/articles/:id', async (req, res) => {
    const found = await centerAt(req.params.address);

    const article =
      found && (await articleOf(found.orgId, found.center.kbTopicId ?? '', req.params.id));

    if (!article) return notFound(res, 'No such article');

    res.json(article);
  });

  router.get('/help-centers/:address/search', async (req, res) => {
    const found = await centerAt(req.params.address);

    if (!found) return notFound(res, 'No such help center');

    const { q } = SearchQuery.parse(req.query);

    res.json(await searchOf(found.orgId, found.center.kbTopicId ?? '', q));
  });

  router.get('/files/:key/:id', shownFile);

  router.use((error: unknown, req: express.Request, res: Response, _next: express.NextFunction) => {
    fail(res, error, `Public route ${req.path}`);
  });

  return router;
};
