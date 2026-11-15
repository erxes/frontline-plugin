import { memberQueries } from '@erxes/core-contract/client';
import {
  IconCalendarUp,
  IconCopy,
  IconEdit,
  IconEye,
  IconFolder,
  IconLabelFilled,
  IconNotes,
  IconProgressCheck,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Badge,
  MemberInline,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  Select,
  toast,
} from 'erxes-ui';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { RowActions, TextCell } from '~/shared/Records.tsx';
import { DateCell } from '~/shared/Table.tsx';
import { CategoryOptions } from './CategoryTree.tsx';
import { useDeleteArticles } from './useKbDeletes.ts';
import {
  ARTICLE_STATUSES,
  type Article,
  type ArticleStatus,
  useCategories,
  useKbAccess,
  useKbChange,
  useKbPanels,
  useKbRoute,
  useStatusNames,
} from './useKnowledgeBase.ts';

const badges = {
  draft: 'secondary',
  scheduled: 'info',
  publish: 'success',
  archived: 'muted',
} as const satisfies Record<ArticleStatus, string>;

const MoreCell = ({ article }: { article: Article }) => {
  const { t } = useTranslation('frontline');
  const panels = useKbPanels();
  const change = useKbChange();
  const { deleteArticles } = useDeleteArticles();

  const duplicate = useMutation(
    orpc.knowledgebase.articles.duplicate.mutationOptions({
      ...change,
      onSuccess: async () => {
        await change.onSuccess();
        toast({ title: t('kb-article-duplicated', 'Article duplicated') });
      },
    }),
  );

  return (
    <RowActions
      label={t('kb-article-actions', 'Actions for {{title}}', { title: article.title })}
      actions={[
        {
          value: 'edit',
          icon: <IconEdit />,
          label: t('edit', 'Edit'),
          onSelect: () => panels.article.open(article.id),
        },
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
          onSelect: () => void deleteArticles([article]),
        },
      ]}
    />
  );
};

/** The article's status; managers change it in place. A scheduled time is set in the panel. */
const StatusCell = ({ article }: { article: Article }) => {
  const { t } = useTranslation('frontline');
  const statuses = useStatusNames();
  const can = useKbAccess();
  const update = useMutation(orpc.knowledgebase.articles.update.mutationOptions(useKbChange()));
  const badge = <Badge variant={badges[article.status]}>{statuses[article.status]}</Badge>;

  if (!can.articles) return <RecordTableInlineCell>{badge}</RecordTableInlineCell>;

  return (
    <RecordTableInlineCell>
      <Select
        value={article.status}
        onValueChange={(status) => update.mutate({ id: article.id, status })}
      >
        <Select.Trigger
          variant="flush"
          aria-label={t('kb-status-of', 'Status of {{title}}', { title: article.title })}
        >
          {badge}
        </Select.Trigger>
        <Select.Content>
          {ARTICLE_STATUSES.map((status) => (
            <Select.Item key={status} value={status} disabled={status === 'scheduled'}>
              {statuses[status]}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </RecordTableInlineCell>
  );
};

/** The article's category; managers move it in place. */
const CategoryCell = ({ article }: { article: Article }) => {
  const { t } = useTranslation('frontline');
  const { topicId } = useKbRoute();
  const can = useKbAccess();
  const rows = useCategories(topicId).data ?? [];
  const update = useMutation(orpc.knowledgebase.articles.update.mutationOptions(useKbChange()));
  const title = rows.find((row) => row.id === article.categoryId)?.title ?? '';

  if (!can.articles)
    return (
      <RecordTableInlineCell>
        <span className="truncate">{title}</span>
      </RecordTableInlineCell>
    );

  return (
    <RecordTableInlineCell>
      <Select
        value={article.categoryId}
        onValueChange={(categoryId) => update.mutate({ id: article.id, categoryId })}
      >
        <Select.Trigger
          variant="flush"
          aria-label={t('kb-category-of', 'Category of {{title}}', { title: article.title })}
        >
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          <CategoryOptions rows={rows} />
        </Select.Content>
      </Select>
    </RecordTableInlineCell>
  );
};

const TitleCell = ({ article }: { article: Article }) => {
  const { article: panel } = useKbPanels();

  return (
    <RecordTableInlineCell>
      <button
        type="button"
        className="truncate hover:underline"
        onClick={() => panel.open(article.id)}
      >
        {article.title}
      </button>
    </RecordTableInlineCell>
  );
};

const column = (
  id: string,
  label: string,
  icon: ComponentProps<typeof RecordTable.InlineHead>['icon'],
  size: number,
  render: (article: Article) => ReactNode,
): RecordTableColumnDef<Article> => ({
  id,
  header: () => <RecordTable.InlineHead label={label} icon={icon} />,
  cell: ({ row }) => render(row.original),
  size,
});

export const useArticleColumns = (): RecordTableColumnDef<Article>[] => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();

  const manage: RecordTableColumnDef<Article>[] = [
    { id: 'more', cell: ({ row }) => <MoreCell article={row.original} />, size: 33 },
    RecordTable.checkboxColumnOf<Article>(),
  ];

  return [
    ...(can.articles ? manage : []),
    column('title', t('title', 'Title'), IconLabelFilled, 300, (article) => (
      <TitleCell article={article} />
    )),
    column('status', t('status', 'Status'), IconProgressCheck, 140, (article) => (
      <StatusCell article={article} />
    )),
    column('category', t('kb-category', 'Category'), IconFolder, 200, (article) => (
      <CategoryCell article={article} />
    )),
    column('summary', t('kb-summary', 'Summary'), IconNotes, 300, (article) => (
      <TextCell value={article.summary} />
    )),
    column('viewCount', t('kb-views', 'Views'), IconEye, 100, (article) => (
      <RecordTableInlineCell>{article.viewCount}</RecordTableInlineCell>
    )),
    column('createdBy', t('kb-created-by', 'Created by'), IconUser, 200, (article) => (
      <RecordTableInlineCell>
        <MemberInline memberId={article.createdBy} members={memberQueries} />
      </RecordTableInlineCell>
    )),
    column('updatedAt', t('updated-at', 'Updated at'), IconCalendarUp, 140, (article) => (
      <DateCell date={article.updatedAt} />
    )),
  ];
};
