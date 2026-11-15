import { memberQueries } from '@erxes/core-contract/client';
import {
  IconArrowBarToRight,
  IconArticle,
  IconCalendarPlus,
  IconCalendarTime,
  IconCalendarUp,
  IconEye,
  IconFolder,
  IconLetterCase,
  IconLock,
  IconNotes,
  IconProgressCheck,
  IconWorldUpload,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  DisplayMenu,
  ListFilter,
  PageContainer,
  RecordList,
  type TListFilterField,
  useListDisplay,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { KB_ARTICLE_TYPE } from '~/plugin.ts';
import { CreateButton, ListEmpty } from '~/shared/List.tsx';
import { ActionsMenu, DeleteButton, SelectionBar } from '~/shared/Records.tsx';
import { ArticleList, ListSelectionBar } from './ArticleList.tsx';
import { ArticlesTable } from './ArticlesTable.tsx';
import { KbHeader } from './KbHeader.tsx';
import { OldLink } from './OldLink.tsx';
import { useDeleteArticles } from './useKbDeletes.ts';
import {
  ARTICLE_STATUSES,
  useArticles,
  useCategories,
  useKbAccess,
  useKbChange,
  useStatusNames,
} from './useKnowledgeBase.ts';

const LIST = 'frontline-kb-articles';

/** Grouped by status first; the table shows every column. */
const DISPLAYS = ['list', 'table'] as const;

/** Sets a status on, moves or deletes the selected articles, each in one request. */
const BulkActions = ({
  topicId,
  selected,
  clear,
}: {
  topicId: string;
  selected: string[];
  clear: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const statuses = useStatusNames();
  const rows = useCategories(topicId).data ?? [];
  const bulk = useMutation(orpc.knowledgebase.articles.bulkUpdate.mutationOptions(useKbChange()));
  const { deleteArticles, isPending } = useDeleteArticles();

  return (
    <>
      <ActionsMenu
        trigger={
          <Button variant="secondary">
            <IconProgressCheck />
            {t('kb-set-status', 'Set status')}
          </Button>
        }
        actions={ARTICLE_STATUSES.filter((status) => status !== 'scheduled').map((status) => ({
          value: status,
          icon: null,
          label: statuses[status],
          onSelect: () => bulk.mutate({ ids: selected, status }, { onSuccess: clear }),
        }))}
      />
      <ActionsMenu
        trigger={
          <Button variant="secondary">
            <IconArrowBarToRight />
            {t('kb-move-to-category', 'Move to category')}
          </Button>
        }
        actions={rows.map((row) => ({
          value: row.id,
          icon: null,
          label: row.title,
          onSelect: () => bulk.mutate({ ids: selected, categoryId: row.id }, { onSuccess: clear }),
        }))}
      />
      <DeleteButton
        disabled={isPending || bulk.isPending}
        onClick={() => void deleteArticles(selected, clear)}
      />
    </>
  );
};

/** What the articles list's filter bar offers; the API applies it (`articles.ts`). */
const useFields = (topicId: string): TListFilterField[] => {
  const { t } = useTranslation('frontline');
  const statuses = useStatusNames();
  const categories = useCategories(topicId).data ?? [];

  return [
    { path: 'subject.title', label: t('title', 'Title'), type: 'text', icon: IconLetterCase },
    { path: 'subject.summary', label: t('kb-summary', 'Summary'), type: 'text', icon: IconNotes },
    {
      path: 'subject.status',
      label: t('status', 'Status'),
      type: 'select',
      icon: IconProgressCheck,
      options: ARTICLE_STATUSES.map((status) => ({ value: status, label: statuses[status] })),
    },
    {
      path: 'subject.categoryId',
      label: t('kb-category', 'Category'),
      type: 'select',
      icon: IconFolder,
      options: categories.map((row) => ({ value: row.id, label: row.title })),
    },
    {
      path: 'subject.isPrivate',
      label: t('kb-is-private', 'Private'),
      type: 'boolean',
      icon: IconLock,
    },
    { path: 'subject.viewCount', label: t('kb-views', 'Views'), type: 'number', icon: IconEye },
    { path: 'subject.createdBy', label: t('created-by', 'Created by'), type: 'member' },
    {
      path: 'subject.createdAt',
      label: t('created-at', 'Created at'),
      type: 'date',
      icon: IconCalendarPlus,
    },
    {
      path: 'subject.updatedAt',
      label: t('updated-at', 'Updated at'),
      type: 'date',
      icon: IconCalendarUp,
    },
    {
      path: 'subject.publishedAt',
      label: t('kb-published-at', 'Published at'),
      type: 'date',
      icon: IconWorldUpload,
    },
    {
      path: 'subject.scheduledAt',
      label: t('kb-scheduled-at', 'Scheduled for'),
      type: 'date',
      icon: IconCalendarTime,
    },
  ];
};

/**
 * A topic's articles under core's list bar, grouped by status or as a table (the Display menu),
 * newest first and a page at a time. An article opens in core's side panel, and New article
 * drafts one there.
 */
export const ArticlesPage = () => {
  const { t } = useTranslation('frontline');
  const topicId = useParams().topicId ?? '';
  const can = useKbAccess();
  const { openNew } = useOpenRecord();
  const [display] = useListDisplay(LIST, DISPLAYS);

  const { articles, totalCount, isPending, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useArticles(topicId);

  const bulk = (selected: string[], clear: () => void) => (
    <BulkActions topicId={topicId} selected={selected} clear={clear} />
  );

  return (
    <PageContainer>
      <OldLink param="editId" contentType={KB_ARTICLE_TYPE} />
      <KbHeader topicId={topicId} label={t('articles', 'Articles')}>
        <CreateButton
          allowed={can.articles}
          label={t('kb-new-article', 'New article')}
          onClick={() => openNew(KB_ARTICLE_TYPE, { topicId })}
        />
      </KbHeader>
      <ViewBar allLabel={t('kb-all-articles', 'All articles')}>
        <ListFilter
          id={LIST}
          fields={useFields(topicId)}
          members={memberQueries}
          totalCount={totalCount}
        >
          <DisplayMenu list={LIST} displays={DISPLAYS} />
        </ListFilter>
      </ViewBar>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && articles.length === 0 ? (
        <ListEmpty
          icon={<IconArticle />}
          title={t('kb-no-articles-yet', 'No articles yet')}
          description={t('kb-no-articles-description', 'Write the first article of this topic.')}
        />
      ) : display === 'table' ? (
        <ArticlesTable
          topicId={topicId}
          articles={articles}
          manage={can.articles}
          isPending={isPending}
          hasNextPage={hasNextPage}
          fetchNextPage={() => void fetchNextPage()}
        >
          {can.articles && <SelectionBar>{bulk}</SelectionBar>}
        </ArticlesTable>
      ) : (
        <RecordList.Provider listId={LIST}>
          {isPending ? (
            <RecordList.Skeleton />
          ) : (
            <ArticleList articles={articles} topicId={topicId} />
          )}
          {hasNextPage && (
            <Button
              variant="ghost"
              className="m-3 self-center"
              disabled={isFetchingNextPage}
              onClick={() => void fetchNextPage()}
            >
              {t('load-more', 'Load more')}
            </Button>
          )}
          {can.articles && (
            <ListSelectionBar shown={articles.map((article) => article.id)}>
              {bulk}
            </ListSelectionBar>
          )}
        </RecordList.Provider>
      )}
    </PageContainer>
  );
};
