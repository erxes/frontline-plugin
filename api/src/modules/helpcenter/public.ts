import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import express, { type Response, type Router } from 'express';
import { db, withOrg } from '#/db/client.ts';
import { helpCenters, publicAddresses } from '#/db/helpcenter.ts';
import { kbArticles, kbCategories, kbTopics } from '#/db/schema.ts';
import { logger } from '#/logger.ts';

/**
 * The help center's organisation and id from the address a signed-out visitor came by: its key,
 * or its domain once Cloudflare serves it.
 */
const centerAt = async (address: string) => {
  const [found] = await db
    .select()
    .from(publicAddresses)
    .where(eq(publicAddresses.address, address.toLowerCase()));

  if (!found) return null;

  return withOrg(found.organizationId, async (tx) => {
    const [center] = await tx
      .select()
      .from(helpCenters)
      .where(eq(helpCenters.id, found.helpCenterId));

    const served =
      center &&
      (center.publicKey === found.address ||
        (center.domainStatus === 'active' && center.sslStatus === 'active'));

    return served ? { orgId: found.organizationId, center } : null;
  });
};

type Center = NonNullable<Awaited<ReturnType<typeof centerAt>>>;

/** What a visitor sees of the help center: its look and its topic's published articles. */
const siteOf = ({ orgId, center }: Center) =>
  withOrg(orgId, async (tx) => {
    const topicId = center.kbTopicId ?? '';
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
      helpCenter: {
        title: center.title,
        description: center.description,
        languageCode: center.languageCode,
        kbLabel: center.kbLabel,
        color: center.color,
        backgroundImage: center.backgroundImage,
        styles: center.styles,
        header: center.header,
        footer: center.footer,
      },
      topic: topic && { title: topic.title, description: topic.description },
      categories,
      articles,
    };
  });

/** One published article of the help center's topic, counted as viewed. */
const articleOf = ({ orgId, center }: Center, id: string) =>
  withOrg(orgId, async (tx) => {
    const [article] = await tx
      .update(kbArticles)
      .set({ viewCount: sql`${kbArticles.viewCount} + 1` })
      .where(
        and(
          eq(kbArticles.id, id),
          eq(kbArticles.status, 'publish'),
          eq(kbArticles.isPrivate, false),
          inArray(
            kbArticles.categoryId,
            tx
              .select({ id: kbCategories.id })
              .from(kbCategories)
              .where(eq(kbCategories.topicId, center.kbTopicId ?? '')),
          ),
        ),
      )
      .returning({
        id: kbArticles.id,
        categoryId: kbArticles.categoryId,
        title: kbArticles.title,
        summary: kbArticles.summary,
        content: kbArticles.content,
        image: kbArticles.image,
        attachments: kbArticles.attachments,
        viewCount: kbArticles.viewCount,
        publishedAt: kbArticles.publishedAt,
      });

    return article ?? null;
  });

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
    const article = found && (await articleOf(found, req.params.id));

    if (!article) return notFound(res, 'No such article');

    res.json(article);
  });

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
