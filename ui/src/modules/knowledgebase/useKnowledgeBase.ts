import type { InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { addPluginStyles, useListFilterParams } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { listPath } from '~/shared/listPath.ts';
import { type PageParam, pageOptions, usePaged } from '~/shared/paging.ts';
import { PLUGIN } from '~/plugin.ts';
import { useChange } from '~/shared/hooks.ts';
import { REFERENCE_MS } from '~/shared/reference.ts';
import css from './styles.css?inline';

// Every knowledge base page and panel slot imports this module, so its utilities load with the
// first of them and stay out of the page module web loads.
addPluginStyles(`${PLUGIN}:knowledgebase`, css);

type Outputs = InferClientOutputs<Client>['knowledgebase'];

export type Topic = Outputs['topics']['get'];

export type Category = Outputs['categories']['get'];

export type Article = Outputs['articles']['list']['articles'][number];

export type ArticleDetail = Outputs['articles']['get'];

export type ArticleStatus = Article['status'];

/** Where the knowledge base lives, as the old plugin had it. */
export const KB_PATH = '/frontline/knowledgebase';

/** A topic page's sections, one address each; its articles are the page's own. */
export const TOPIC_SECTIONS = ['articles', 'categories', 'settings'] as const;

export type TopicSection = (typeof TOPIC_SECTIONS)[number];

/** A topic's own page, open at `section`. */
export const topicPath = (topicId: string, section: TopicSection = 'articles') =>
  `${KB_PATH}/${encodeURIComponent(topicId)}${section === 'articles' ? '' : `/${section}`}`;

/** An article on its own page, where it is written. */
export const articlePath = (id: string) => `${KB_PATH}/article/${encodeURIComponent(id)}`;

/** The topic's articles, narrowed to a category and the ones under it, as the filter bar holds it. */
export const categoryArticlesPath = (topicId: string, categoryId: string) =>
  listPath(topicPath(topicId, 'articles'), {
    path: 'subject.categoryId',
    op: 'eq',
    value: categoryId,
  });

/** The statuses in the order the list groups them. */
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
).map(([name, label]) => ({
  value: `https://erxes.s3.amazonaws.com/icons/${name}.svg`,
  key: `kb-reaction-${name}`,
  label,
}));

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

/** A language code's name in the member's language. */
export const useLanguageName = () => {
  const { i18n } = useTranslation('frontline');
  const names = new Intl.DisplayNames([i18n.language], { type: 'language' });

  return (code: string) => names.of(code) ?? code;
};

/** Every topic by title, with what the member may change. */
const topicsQuery = (input: { filter?: string; search?: string }) =>
  orpc.knowledgebase.topics.list.queryOptions({ input });

/** The topics the filter bar leaves. */
export const useTopics = () => useQuery(topicsQuery(useListFilterParams()));

/**
 * Every topic with what the member may change, read by each article row and topic pick. The
 * knowledge base's own changes refetch it, so a mounting row doesn't.
 */
const everyTopic = orpc.knowledgebase.topics.list.queryOptions({
  input: {},
  staleTime: REFERENCE_MS,
});

/** What the member may change; nothing until the topics load. */
export const useKbAccess = () =>
  useQuery({ ...everyTopic, select: (data) => data.can }).data ?? {
    topics: false,
    categories: false,
    articles: false,
  };

/** Every topic, for a pick of one. */
export const useAllTopics = () =>
  useQuery({ ...everyTopic, select: (data) => data.topics }).data ?? [];

export const useTopic = (id: string) =>
  useQuery(orpc.knowledgebase.topics.get.queryOptions({ input: { id }, enabled: Boolean(id) }));

/** A topic's categories in tree order, each with the articles in it and under it. */
export const useCategories = (topicId: string, filter: { filter?: string; search?: string } = {}) =>
  useQuery(
    orpc.knowledgebase.categories.list.queryOptions({
      input: { topicId, ...filter },
      enabled: Boolean(topicId),
      select: (data) => categoryTree(data.categories),
    }),
  );

export const useCategory = (id: string) =>
  useQuery(orpc.knowledgebase.categories.get.queryOptions({ input: { id } }));

/** The topic's articles newest first, a page at a time, narrowed by the filter bar. */
export const useArticles = (topicId: string) => {
  const filter = useListFilterParams();

  return usePaged(
    useInfiniteQuery(
      orpc.knowledgebase.articles.list.infiniteOptions({
        input: ({ cursor }: PageParam) => ({ topicId, ...filter, cursor }),
        ...pageOptions,
      }),
    ),
    (page) => page.articles,
  );
};

export const useArticle = (id: string) =>
  useQuery(orpc.knowledgebase.articles.get.queryOptions({ input: { id } }));

/** Refetches every knowledge base query after a change, and shows a refusal. */
export const useKbChange = () => useChange(orpc.knowledgebase.key());

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
