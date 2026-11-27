import { IconCopy, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Badge, buttonVariants, Select, toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import type { RowAction } from '~/shared/Records.tsx';
import { CategorySelect } from './CategoryTree.tsx';
import { useDeleteArticles } from './useKbDeletes.ts';
import {
  ARTICLE_STATUSES,
  type ArticleStatus,
  useCategories,
  useKbAccess,
  useKbChange,
  useStatusNames,
  articlePath,
} from './useKnowledgeBase.ts';

/** What a row and the panel show of an article: enough to name it, file it and move it. */
type ArticleRef = { id: string; title: string; status: ArticleStatus; categoryId: string };

const badges = {
  draft: 'secondary',
  scheduled: 'info',
  publish: 'success',
  archived: 'muted',
} as const satisfies Record<ArticleStatus, string>;

/** The status as a badge. */
export const StatusBadge = ({ status }: { status: ArticleStatus }) => (
  <Badge variant={badges[status]}>{useStatusNames()[status]}</Badge>
);

/** Copy and delete, for article managers. */
export const useArticleActions = (article: ArticleRef): RowAction[] => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();
  const change = useKbChange();
  const { deleteArticles } = useDeleteArticles();

  const duplicate = useMutation(
    orpc.knowledgebase.articles.duplicate.mutationOptions({
      ...change,
      onSuccess: () => {
        change.onSuccess();
        toast({ title: t('kb-article-duplicated', 'Article duplicated') });
      },
    }),
  );

  if (!can.articles) return [];

  return [
    {
      value: 'duplicate',
      icon: <IconCopy />,
      label: t('kb-duplicate', 'Duplicate'),
      onSelect: () =>
        duplicate.mutate({
          id: article.id,
          title: t('kb-article-copy-title', '{{title}} (copy)', { title: article.title }),
        }),
    },
    {
      value: 'delete',
      icon: <IconTrash />,
      label: t('delete', 'Delete'),
      onSelect: () => void deleteArticles([article.id]),
    },
  ];
};

/** The title opens the article on its own page, where it is written. */
export const ArticleTitle = ({ article }: { article: ArticleRef }) => (
  <Link
    to={articlePath(article.id)}
    className={buttonVariants({ variant: 'ghost', className: 'min-w-0 justify-start' })}
  >
    <span className="truncate">{article.title}</span>
  </Link>
);

/**
 * The status, which article managers change in place. Scheduling needs a time, so it is set in
 * the article's page.
 */
export const StatusPicker = ({ article }: { article: ArticleRef }) => {
  const { t } = useTranslation('frontline');
  const statuses = useStatusNames();
  const can = useKbAccess();
  const update = useMutation(orpc.knowledgebase.articles.update.mutationOptions(useKbChange()));

  if (!can.articles) return <StatusBadge status={article.status} />;

  return (
    <Select
      value={article.status}
      onValueChange={(status) => update.mutate({ id: article.id, status })}
    >
      <Select.Trigger
        variant="flush"
        aria-label={t('kb-status-of', 'Status of {{title}}', { title: article.title })}
      >
        <StatusBadge status={article.status} />
      </Select.Trigger>
      <Select.Content>
        {ARTICLE_STATUSES.map((status) => (
          <Select.Item key={status} value={status} disabled={status === 'scheduled'}>
            {statuses[status]}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};

/** The category, which article managers move the article to in place. */
export const CategoryPicker = ({ article, topicId }: { article: ArticleRef; topicId: string }) => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();
  const rows = useCategories(topicId).data ?? [];
  const update = useMutation(orpc.knowledgebase.articles.update.mutationOptions(useKbChange()));

  if (!can.articles)
    return (
      <span className="truncate">
        {rows.find((row) => row.id === article.categoryId)?.title ?? ''}
      </span>
    );

  return (
    <CategorySelect
      topicId={topicId}
      value={article.categoryId}
      onChange={(categoryId) => update.mutate({ id: article.id, categoryId })}
      label={t('kb-category-of', 'Category of {{title}}', { title: article.title })}
      flush
    />
  );
};
