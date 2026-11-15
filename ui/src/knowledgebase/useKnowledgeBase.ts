import type { InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMatch } from 'react-router-dom';
import { orpc } from '../orpc.ts';
import { useChange, useParamPanel, useSearch } from '../shared/hooks.ts';

type Outputs = InferClientOutputs<Client>['knowledgebase'];

export type Topic = Outputs['topics']['get'];

export type Category = Outputs['categories']['list']['categories'][number];

export type Article = Outputs['articles']['list']['articles'][number];

export type ArticleDetail = Outputs['articles']['get'];

export type ArticleStatus = Article['status'];

export type Attachment = ArticleDetail['attachments'][number];

/** Where the knowledge base lives, as the old plugin had it. */
export const KB_PATH = '/frontline/knowledgebase';

/** A topic's pages, by the path segment after its id. */
const KB_SECTIONS = ['articles', 'categories', 'kbsettings'] as const;

export const ARTICLE_STATUSES = [
  'draft',
  'scheduled',
  'publish',
  'archived',
] as const satisfies readonly ArticleStatus[];

/** The languages a topic can be written in, as the old plugin offered them. */
export const LANGUAGE_CODES = ['en', 'mn', 'zh', 'ja', 'ko', 'ru'];

/** The reactions readers can leave on an article, as the published site draws them. */
export const REACTIONS = (
  [
    ['sad', 'Sad'],
    ['neutral', 'Neutral'],
    ['grinning', 'Happy'],
    ['like', 'Like'],
    ['dislike', 'Dislike'],
  ] as const
).map(([name, label]) => ({ value: `https://erxes.s3.amazonaws.com/icons/${name}.svg`, label }));

/** A status as members read it. */
export const useStatusNames = (): Record<ArticleStatus, string> => {
  const { t } = useTranslation('frontline');

  return {
    draft: t('kb-draft', 'Draft'),
    scheduled: t('kb-scheduled', 'Scheduled'),
    publish: t('kb-published', 'Published'),
    archived: t('archived', 'Archived'),
  };
};

/** The open topic and its page, from the path; empty on the knowledge base's root. */
export const useKbRoute = () => {
  const match = useMatch(`${KB_PATH}/:topicId/:section`);

  return {
    topicId: match?.params.topicId ?? '',
    section: KB_SECTIONS.find((section) => section === match?.params.section),
  };
};

/** Every topic by title, with what the member may change. */
export const useTopics = () => useQuery(orpc.knowledgebase.topics.list.queryOptions({ input: {} }));

/** What the member may change; nothing until the topics load. */
export const useKbAccess = () =>
  useTopics().data?.can ?? { topics: false, categories: false, articles: false };

export const useTopic = (id: string) =>
  useQuery(orpc.knowledgebase.topics.get.queryOptions({ input: { id }, enabled: Boolean(id) }));

/** A topic's categories in tree order, each with the articles in it and under it. */
export const useCategories = (topicId: string) =>
  useQuery(
    orpc.knowledgebase.categories.list.queryOptions({
      input: { topicId },
      enabled: Boolean(topicId),
      select: (data) => categoryTree(data.categories),
    }),
  );

export const useCategory = (id: string) =>
  useQuery(orpc.knowledgebase.categories.get.queryOptions({ input: { id } }));

/** The articles filters in the query string, as the old page kept them. */
export const useArticleFilters = () => {
  const [status, setStatus] = useQueryState('status', parseAsStringLiteral(ARTICLE_STATUSES));
  const [categoryId, setCategoryId] = useQueryState('categoryId');

  return { status, setStatus, categoryId, setCategoryId };
};

/** The topic's articles newest first, a page at a time, narrowed by the filters. */
export const useArticles = (topicId: string) => {
  const search = useSearch() || undefined;
  const { status, categoryId } = useArticleFilters();

  const query = useInfiniteQuery(
    orpc.knowledgebase.articles.list.infiniteOptions({
      input: (cursor: string | undefined) => ({
        topicId,
        search,
        status: status ?? undefined,
        categoryId: categoryId ?? undefined,
        cursor,
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );

  return {
    ...query,
    articles: query.data?.pages.flatMap((page) => page.articles) ?? [],
    totalCount: query.data?.pages[0]?.totalCount,
  };
};

export const useArticle = (id: string) =>
  useQuery(orpc.knowledgebase.articles.get.queryOptions({ input: { id } }));

/** Refetches every knowledge base query after a change, and shows a refusal. */
export const useKbChange = () => useChange(orpc.knowledgebase.key());

/**
 * The side panels: `?topic=new` creates a topic and `?topic=<id>` edits one;
 * `category` and `article` work the same within the open topic.
 */
export const useKbPanels = () => ({
  topic: useParamPanel('topic'),
  category: useParamPanel('category'),
  article: useParamPanel('article'),
});

/**
 * An old plugin link's query param, `key`, handed to `open` and dropped:
 * `?editId=<id>` opens that record's panel, `?createTopic=true` the new topic's.
 */
export const useOldLink = (key: 'editId' | 'createTopic', open: (value: string) => void) => {
  const [value, setValue] = useQueryState(key);

  useEffect(() => {
    if (!value) return;

    void setValue(null);
    open(value);
  }, [value, open, setValue]);
};

/** A category in tree order, with how deep it sits. */
export type CategoryRow = Category & { depth: number };

/** The categories as a tree, flattened: parents before their children, each level by title. */
const categoryTree = (categories: Category[]) => {
  const ids = new Set(categories.map((category) => category.id));

  const children = Map.groupBy(categories, (category) =>
    category.parentId && ids.has(category.parentId) ? category.parentId : null,
  );

  const rows: CategoryRow[] = [];
  const seen = new Set<string>();

  const visit = (category: Category, depth: number) => {
    if (seen.has(category.id)) return;

    seen.add(category.id);
    rows.push({ ...category, depth });
    (children.get(category.id) ?? []).forEach((child) => visit(child, depth + 1));
  };

  (children.get(null) ?? []).forEach((root) => visit(root, 0));
  // A cycle an import brought in has no root; its categories still show, at the top.
  categories.forEach((category) => visit(category, 0));

  return rows;
};

/** The ids of `id` and every category under it. */
export const subtreeOf = (rows: CategoryRow[], id: string) => {
  const start = rows.findIndex((row) => row.id === id);
  const depth = rows[start]?.depth ?? 0;
  const end = rows.findIndex((row, index) => index > start && row.depth <= depth);

  return start < 0 ? [] : rows.slice(start, end < 0 ? undefined : end).map((row) => row.id);
};
