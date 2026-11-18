import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import express, { type Response, type Router } from 'express';
import sanitizeHtml from 'sanitize-html';
import { withOrg } from '#/db/client.ts';
import { forms } from '#/db/forms.ts';
import { HELP_CENTER_DOMAIN, HELP_CENTER_KEY, helpCenters } from '#/db/helpcenter.ts';
import { kbArticles, kbCategories, kbTopics } from '#/db/schema.ts';
import type { Attachment } from '#/db/table.ts';
import { logger } from '#/logger.ts';
import { urlOf } from '../forms/embed.ts';
import { keyOfOrganization, openedBy, widgetScript } from '../public.ts';
import { countView } from '../views.ts';
import { shownFile, shownKeyOf, shownUrl } from '../shownFiles.ts';

/**
 * The help center's organisation and id from the address a signed-out visitor came by: its key,
 * or its domain once Cloudflare serves it.
 */
const centerAt = async (address: string) => {
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

type Center = NonNullable<Awaited<ReturnType<typeof centerAt>>>;

/**
 * An article's HTML as a visitor's page may show it: sanitize-html's default formatting tags,
 * plus images, with links opening in a new tab.
 */
const visitorHtml = (html: string, key: string) => {
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

/** A topic's categories and published public articles, as a help center or messenger shows them. */
export const topicOf = (orgId: string, topicId: string) =>
  withOrg(orgId, async (tx) => {
    const [topic] = await tx.select().from(kbTopics).where(eq(kbTopics.id, topicId));

    const categories = await tx
      .select({
        id: kbCategories.id,
        parentId: kbCategories.parentId,
        title: kbCategories.title,
        description: kbCategories.description,
        icon: kbCategories.icon,
      })
      .from(kbCategories)
      .where(eq(kbCategories.topicId, topicId))
      .orderBy(asc(kbCategories.title));

    const articles = await tx
      .select({
        id: kbArticles.id,
        categoryId: kbArticles.categoryId,
        title: kbArticles.title,
        summary: kbArticles.summary,
        viewCount: kbArticles.viewCount,
        publishedAt: kbArticles.publishedAt,
      })
      .from(kbArticles)
      .where(
        and(
          inArray(
            kbArticles.categoryId,
            categories.map((category) => category.id),
          ),
          eq(kbArticles.status, 'publish'),
          eq(kbArticles.isPrivate, false),
        ),
      )
      .orderBy(desc(kbArticles.publishedAt));

    return {
      topic: topic && { title: topic.title, description: topic.description, color: topic.color },
      categories,
      articles,
    };
  });

/**
 * The active forms of `ids`, in their order, with where an embed reads each and its script, by
 * the organisation's `key`.
 */
const formsOf = (orgId: string, key: string, ids: string[]) =>
  withOrg(orgId, async (tx) => {
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
  });

/**
 * What a visitor sees of the help center: its look, with its images where a visitor loads them,
 * its topic's published articles and its forms.
 */
const siteOf = async ({ orgId, center }: Center) => {
  const key = await shownKeyOf(orgId);
  const shown = (url: string | null | undefined) => url && shownUrl(key, url);

  return {
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
    ...(await topicOf(orgId, center.kbTopicId ?? '')),
    forms: await formsOf(orgId, key, center.formIds),
  };
};

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
      .where(
        and(
          eq(kbArticles.id, id),
          eq(kbArticles.status, 'publish'),
          eq(kbArticles.isPrivate, false),
          eq(kbCategories.topicId, topicId),
        ),
      );

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
export type VisitorTopic = Awaited<ReturnType<typeof topicOf>>;

export type VisitorArticle = NonNullable<Awaited<ReturnType<typeof articleOf>>>;

export type VisitorSite = Awaited<ReturnType<typeof siteOf>>;

const notFound = (res: Response, message: string) => {
  res.status(404).json({ message });
};

/**
 * The signed-out routes under `/api/public`: a help center's site and articles by its key or
 * domain, and which key a domain serves, for the help center app in front of it.
 */
export const publicRouter = (): Router => {
  const router = express.Router();

  router.get('/help-centers/:address', async (req, res) => {
    const found = await centerAt(req.params.address);

    if (!found) return notFound(res, 'No such help center');

    res.set('cache-control', 'public, max-age=60');
    res.json(await siteOf(found));
  });

  router.get('/help-centers/:address/articles/:id', async (req, res) => {
    const found = await centerAt(req.params.address);

    const article =
      found && (await articleOf(found.orgId, found.center.kbTopicId ?? '', req.params.id));

    if (!article) return notFound(res, 'No such article');

    res.json(article);
  });

  router.get('/files/:key/:id', shownFile);

  router.get('/custom-domains/resolve', async (req, res) => {
    const host = typeof req.query.host === 'string' ? req.query.host : '';
    const found = host ? await centerAt(host) : null;

    if (!found || found.center.publicKey === host.toLowerCase())
      return notFound(res, 'Unknown domain');

    res.set('cache-control', 'private, max-age=60');
    res.json({ key: found.center.publicKey });
  });

  router.use((error: unknown, req: express.Request, res: Response, _next: express.NextFunction) => {
    logger.error({ err: error, path: req.path }, 'Public route failed');
    res.status(500).json({ message: 'Something went wrong' });
  });

  return router;
};
