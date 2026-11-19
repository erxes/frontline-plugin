import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import { LRUCache } from 'lru-cache';
import { z } from 'zod';
import { type Tx, withOrg } from '#/db/client.ts';
import { kbArticles, kbCategories, kbTopics } from '#/db/schema.ts';
import { likeText } from '../filter.ts';
import { published } from '../shownFiles.ts';
import { articlesOnPage } from './paging.ts';

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
export const topicIn = async (tx: Tx, orgId: string, topicId: string) => {
  const cacheKey = `${orgId} ${topicId}`;
  const cached = topics.get(cacheKey);

  if (cached) return cached;

  const loaded = await loadTopic(tx, topicId);

  topics.set(cacheKey, loaded);

  return loaded;
};

/** `topicIn` in a transaction of its own. */
const topicOf = (orgId: string, topicId: string) =>
  withOrg(orgId, (tx) => topicIn(tx, orgId, topicId));

/**
 * A topic as the messenger and the knowledge base embed open it: its categories, each with its
 * article count, but not the articles, which `categoryArticlesOf` lists a page at a time.
 */
export const shelvesOf = async (orgId: string, topicId: string) => {
  const { articles, ...shelves } = await topicOf(orgId, topicId);

  return shelves;
};

/**
 * Page `page` of a category's own published articles, newest first. Null for a category not in
 * the topic, or a page past its last.
 */
export const categoryArticlesOf = async (
  orgId: string,
  topicId: string,
  categoryId: string,
  page: number,
) => {
  const { categories, articles } = await topicOf(orgId, topicId);

  return categories.some((category) => category.id === categoryId)
    ? articlesOnPage(articles, categoryId, page)
    : null;
};
