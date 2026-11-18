import {
  IconCalendarUp,
  IconEye,
  IconFolder,
  IconLetterCase,
  IconNotes,
  IconProgressCheck,
  IconUser,
} from '@tabler/icons-react';
import { RecordTable, type RecordTableColumnDef, RecordTableInlineCell } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MemberLine } from '~/shared/Person.tsx';
import { RowActions, TextCell } from '~/shared/Records.tsx';
import type { Paging } from '~/shared/paging.ts';
import { column as columnOf, DateCell, PagedRows } from '~/shared/Table.tsx';
import { ArticleTitle, CategoryPicker, StatusPicker, useArticleActions } from './ArticleCells.tsx';
import type { Article } from './useKnowledgeBase.ts';

const column = columnOf<Article>;

const MoreCell = ({ article }: { article: Article }) => {
  const { t } = useTranslation('frontline');
  const actions = useArticleActions(article);

  if (actions.length === 0) return null;

  return (
    <RowActions
      label={t('kb-article-actions', 'Actions for {{title}}', { title: article.title })}
      actions={actions}
    />
  );
};

const useColumns = (topicId: string, manage: boolean): RecordTableColumnDef<Article>[] => {
  const { t } = useTranslation('frontline');

  return [
    {
      id: 'more',
      header: () => <RecordTable.ColumnSelector />,
      cell: ({ row }) => <MoreCell article={row.original} />,
      size: 33,
    },
    ...(manage ? [RecordTable.checkboxColumnOf<Article>()] : []),
    column('title', t('title', 'Title'), IconLetterCase, 300, (article) => (
      <RecordTableInlineCell>
        <ArticleTitle article={article} />
      </RecordTableInlineCell>
    )),
    column('status', t('status', 'Status'), IconProgressCheck, 140, (article) => (
      <RecordTableInlineCell>
        <StatusPicker article={article} />
      </RecordTableInlineCell>
    )),
    column('category', t('kb-category', 'Category'), IconFolder, 200, (article) => (
      <RecordTableInlineCell>
        <CategoryPicker article={article} topicId={topicId} />
      </RecordTableInlineCell>
    )),
    column('summary', t('kb-summary', 'Summary'), IconNotes, 300, (article) => (
      <TextCell value={article.summary} />
    )),
    column('viewCount', t('kb-views', 'Views'), IconEye, 100, (article) => (
      <RecordTableInlineCell>{article.viewCount}</RecordTableInlineCell>
    )),
    column('createdBy', t('created-by', 'Created by'), IconUser, 200, (article) => (
      <RecordTableInlineCell>
        <MemberLine id={article.createdBy} />
      </RecordTableInlineCell>
    )),
    column('updatedAt', t('updated-at', 'Updated at'), IconCalendarUp, 140, (article) => (
      <DateCell date={article.updatedAt} />
    )),
  ];
};

/** The articles as a table, a page at a time, with the status and category editable in the row. */
export const ArticlesTable = ({
  topicId,
  articles,
  manage,
  paging,
  children,
}: {
  topicId: string;
  articles: Article[];
  /** Whether rows can be picked for the bulk bar (`children`). */
  manage: boolean;
  paging: Paging;
  children: ReactNode;
}) => (
  <RecordTable.Provider
    tableId="frontline_kb_articles"
    columns={useColumns(topicId, manage)}
    data={articles}
    stickyColumns={['more', 'checkbox', 'title']}
    className="m-3"
  >
    <PagedRows paging={paging} count={articles.length} />
    {children}
  </RecordTable.Provider>
);
