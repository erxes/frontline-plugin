import { IconArrowBarToRight, IconArticle, IconProgressCheck } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Button, RecordTable, Select } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '../orpc.ts';
import { CreateButton, ListEmpty, SearchSubHeader } from '../shared/List.tsx';
import { ActionsMenu, DeleteButton, SelectionBar } from '../shared/Records.tsx';
import { PagedRows } from '../shared/Table.tsx';
import { useArticleColumns } from './ArticlesTable.tsx';
import { CategoryOptions } from './CategoryTree.tsx';
import { useDeleteArticles } from './useKbDeletes.ts';
import {
  ARTICLE_STATUSES,
  useArticleFilters,
  useArticles,
  useCategories,
  useOldLink,
  useKbAccess,
  useKbChange,
  useKbPanels,
  useKbRoute,
  useStatusNames,
} from './useKnowledgeBase.ts';

const ALL = 'all';

/** Narrows the list to a status, and to a category with the ones under it. */
const ArticleFilters = ({ topicId }: { topicId: string }) => {
  const { t } = useTranslation('frontline');
  const statuses = useStatusNames();
  const rows = useCategories(topicId).data ?? [];
  const { status, setStatus, categoryId, setCategoryId } = useArticleFilters();

  return (
    <>
      <Select
        value={status ?? ALL}
        onValueChange={(next) =>
          void setStatus(ARTICLE_STATUSES.find((value) => value === next) ?? null)
        }
      >
        <Select.Trigger variant="bordered" aria-label={t('status', 'Status')} className="w-36">
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={ALL}>{t('kb-all-statuses', 'All statuses')}</Select.Item>
          {ARTICLE_STATUSES.map((value) => (
            <Select.Item key={value} value={value}>
              {statuses[value]}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
      <Select
        value={categoryId ?? ALL}
        onValueChange={(next) => void setCategoryId(next === ALL ? null : next)}
      >
        <Select.Trigger
          variant="bordered"
          aria-label={t('kb-category', 'Category')}
          className="w-44"
        >
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value={ALL}>{t('kb-all-categories', 'All categories')}</Select.Item>
          <CategoryOptions rows={rows} />
        </Select.Content>
      </Select>
    </>
  );
};

/** Sets a status on, moves or deletes the selected articles, each in one request. */
const ArticlesCommandBar = ({ topicId }: { topicId: string }) => {
  const { t } = useTranslation('frontline');
  const statuses = useStatusNames();
  const rows = useCategories(topicId).data ?? [];
  const bulk = useMutation(orpc.knowledgebase.articles.bulkUpdate.mutationOptions(useKbChange()));
  const { deleteArticles, isPending } = useDeleteArticles();

  return (
    <SelectionBar>
      {(selected, clear) => (
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
              onSelect: () =>
                bulk.mutate({ ids: selected, categoryId: row.id }, { onSuccess: clear }),
            }))}
          />
          <DeleteButton
            disabled={isPending || bulk.isPending}
            onClick={() =>
              void deleteArticles(
                selected.map((id) => ({ id })),
                clear,
              )
            }
          />
        </>
      )}
    </SelectionBar>
  );
};

/** A topic's articles, newest first: search and filters, paging, edits in place and bulk changes. */
export const ArticlesPage = () => {
  const { t } = useTranslation('frontline');
  const { topicId } = useKbRoute();
  const can = useKbAccess();
  const panels = useKbPanels();
  const columns = useArticleColumns();

  const { articles, totalCount, isPending, error, hasNextPage, fetchNextPage } =
    useArticles(topicId);

  useOldLink('editId', panels.article.open);

  return (
    <>
      <SearchSubHeader id="frontline-kb-articles-filter" count={totalCount}>
        <ArticleFilters topicId={topicId} />
      </SearchSubHeader>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && articles.length === 0 ? (
        <ListEmpty
          icon={<IconArticle />}
          title={t('kb-no-articles-yet', 'No articles yet')}
          description={t('kb-no-articles-description', 'Write the first article of this topic.')}
          action={
            <CreateButton
              allowed={can.articles}
              label={t('kb-new-article', 'New Article')}
              onClick={() => panels.article.open('new')}
            />
          }
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_kb_articles"
          columns={columns}
          data={articles}
          stickyColumns={['more', 'checkbox', 'title']}
          className="m-3"
        >
          <PagedRows
            isPending={isPending}
            hasNextPage={hasNextPage}
            count={articles.length}
            fetchNextPage={() => void fetchNextPage()}
          />
          {can.articles && <ArticlesCommandBar topicId={topicId} />}
        </RecordTable.Provider>
      )}
    </>
  );
};
