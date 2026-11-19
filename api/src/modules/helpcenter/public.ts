import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import express, { type Response, type Router } from 'express';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import { LRUCache } from 'lru-cache';
import { type Tx, withOrg } from '#/db/client.ts';
import { forms } from '#/db/forms.ts';
import { HELP_CENTER_DOMAIN, HELP_CENTER_KEY, helpCenters } from '#/db/helpcenter.ts';
import { integrations } from '#/db/inbox.ts';
import { publicKeys } from '#/db/public.ts';
import { kbArticles, kbCategories, kbTopics } from '#/db/schema.ts';
import type { Attachment } from '#/db/table.ts';
import { fail } from '../fail.ts';
import { urlOf } from '../forms/embed.ts';
import { INTEGRATION_KEY } from '../inbox/insertIntegration.ts';
import { messenger } from '../messenger/adapter.ts';
import { keyOfOrganization, openedBy, widgetScript } from '../public.ts';
import { countView } from '../views.ts';
import { likeText } from '../filter.ts';
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

/** An article as a list shows it, without its body. */
const listed = {
  id: kbArticles.id,
  categoryId: kbArticles.categoryId,
  title: kbArticles.title,
  summary: kbArticles.summary,
  viewCount: kbArticles.viewCount,
  publishedAt: kbArticles.publishedAt,
};

/** What a visitor searches a topic with: a few words, matched as written. */
export const SearchQuery = z.object({ q: z.string().trim().min(1).max(100) });

/**
 * The topic's articles a visitor may read whose title, summary or text holds `term`, ignoring
 * case and the body's tags, newest first.
 */
export const searchOf = (orgId: string, topicId: string, term: string) => {
  const pattern = likeText(term);

  return withOrg(orgId, (tx) =>
    tx
      .select(listed)
      .from(kbArticles)
      .innerJoin(kbCategories, eq(kbCategories.id, kbArticles.categoryId))
      .where(
        and(
          eq(kbCategories.topicId, topicId),
          published,
          or(
            ilike(kbArticles.title, pattern),
            ilike(kbArticles.summary, pattern),
            ilike(kbArticles.plainText, pattern),
          ),
        ),
      )
      .orderBy(desc(kbArticles.publishedAt))
      .limit(50),
  );
};

const loadTopic = async (tx: Tx, topicId: string) => {
  const [topic] = await tx.select().from(kbTopics).where(eq(kbTopics.id, topicId));

  const rows = await tx
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
    .select(listed)
    .from(kbArticles)
    .where(
      and(
        inArray(
          kbArticles.categoryId,
          rows.map((category) => category.id),
        ),
        published,
      ),
    )
    .orderBy(desc(kbArticles.publishedAt));

  const children = Map.groupBy(rows, (row) => row.parentId);

  /** The ids of a category and every one below it, each once, though an import may loop. */
  const tree = (id: string, seen = new Set<string>()): Set<string> => {
    if (seen.has(id)) return seen;

    seen.add(id);

    for (const child of children.get(id) ?? []) tree(child.id, seen);

    return seen;
  };

  return {
    topic: topic && {
      title: topic.title,
      description: topic.description,
      color: topic.color,
      languageCode: topic.languageCode,
    },
    // Each with the published articles it and the categories below it hold.
    categories: rows.map((row) => {
      const ids = tree(row.id);

      return { ...row, articleCount: articles.filter((item) => ids.has(item.categoryId)).length };
    }),
    articles,
  };
};

/**
 * Topics visitors read lately, by organisation and topic: a busy help center or messenger reads
 * a topic's rows once in 30 s, and a change shows within that.
 */
const topics = new LRUCache<string, Awaited<ReturnType<typeof loadTopic>>>({
  max: 500,
  ttl: 30_000,
});

/** A topic's categories and published public articles, as a help center or messenger shows them. */
const topicIn = async (tx: Tx, orgId: string, topicId: string) => {
  const cacheKey = `${orgId} ${topicId}`;
  const cached = topics.get(cacheKey);

  if (cached) return cached;

  const loaded = await loadTopic(tx, topicId);

  topics.set(cacheKey, loaded);

  return loaded;
};

/** `topicIn` in a transaction of its own. */
export const topicOf = (orgId: string, topicId: string) =>
  withOrg(orgId, (tx) => topicIn(tx, orgId, topicId));

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
export type VisitorTopic = Awaited<ReturnType<typeof topicOf>>;

export type VisitorArticle = NonNullable<Awaited<ReturnType<typeof articleOf>>>;

export type VisitorSite = Awaited<ReturnType<typeof siteOf>>['site'];

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

    res.set('cache-control', 'public, max-age=60');
    res.json((await siteOf(found)).site);
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
