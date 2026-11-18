import { memberQueries } from '@erxes/core-contract/client';
import {
  IconArticle,
  IconCalendarPlus,
  IconCode,
  IconFileDescription,
  IconFolder,
  IconFolderUp,
  IconLetterCase,
  IconPlus,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import {
  Button,
  IconComponent,
  ListFilter,
  PageContainer,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  type TListFilterField,
  useListFilterParams,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { MemberLine } from '~/shared/Person.tsx';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { KB_CATEGORY_TYPE } from '~/plugin.ts';
import { CreateButton, ListEmpty, ListError } from '~/shared/List.tsx';
import { DeleteButton, RowActions, SelectionBar, TextCell } from '~/shared/Records.tsx';
import { DateCell, Rows } from '~/shared/Table.tsx';
import { Indent } from './CategoryTree.tsx';
import { KbHeader } from './KbHeader.tsx';
import { OldLink } from './OldLink.tsx';
import { useDeleteCategories } from './useKbDeletes.ts';
import {
  type CategoryRow,
  categoryArticlesPath,
  useCategories,
  useKbAccess,
} from './useKnowledgeBase.ts';

const MoreCell = ({ category }: { category: CategoryRow }) => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();
  const navigate = useNavigate();
  const { openNew } = useOpenRecord();
  const { deleteCategories } = useDeleteCategories();

  return (
    <RowActions
      label={t('kb-category-actions', 'Actions for {{title}}', { title: category.title })}
      actions={[
        {
          value: 'articles',
          icon: <IconArticle />,
          label: t('kb-view-articles', 'View articles'),
          onSelect: () => void navigate(categoryArticlesPath(category.topicId, category.id)),
        },
        ...(can.categories
          ? [
              {
                value: 'subcategory',
                icon: <IconPlus />,
                label: t('kb-new-subcategory', 'New subcategory'),
                onSelect: () =>
                  openNew(KB_CATEGORY_TYPE, {
                    topicId: category.topicId,
                    parentId: category.id,
                  }),
              },
              {
                value: 'delete',
                icon: <IconTrash />,
                label: t('delete', 'Delete'),
                onSelect: () => void deleteCategories([category.id]),
              },
            ]
          : []),
      ]}
    />
  );
};

/** The title under its parent, indented by depth, opening the category in core's side panel. */
const TitleCell = ({ category }: { category: CategoryRow }) => {
  const { open } = useOpenRecord();

  return (
    <RecordTableInlineCell>
      <Indent depth={category.depth} />
      <Button
        variant="ghost"
        className="min-w-0 flex-1 justify-start"
        onClick={() => open({ contentType: KB_CATEGORY_TYPE, contentId: category.id })}
      >
        <IconComponent name={category.icon ?? 'IconFolder'} className="size-4 shrink-0" />
        <span className="truncate">{category.title}</span>
      </Button>
    </RecordTableInlineCell>
  );
};

const useColumns = (): RecordTableColumnDef<CategoryRow>[] => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();

  return [
    {
      id: 'more',
      header: () => <RecordTable.ColumnSelector />,
      cell: ({ row }) => <MoreCell category={row.original} />,
      size: 33,
    },
    ...(can.categories ? [RecordTable.checkboxColumnOf<CategoryRow>()] : []),
    {
      id: 'title',
      header: () => <RecordTable.InlineHead label={t('title', 'Title')} icon={IconLetterCase} />,
      cell: ({ row }) => <TitleCell category={row.original} />,
      size: 300,
    },
    {
      id: 'description',
      header: () => (
        <RecordTable.InlineHead
          label={t('description', 'Description')}
          icon={IconFileDescription}
        />
      ),
      cell: ({ row }) => <TextCell value={row.original.description} />,
      size: 300,
    },
    {
      id: 'articleCount',
      header: () => <RecordTable.InlineHead label={t('articles', 'Articles')} icon={IconArticle} />,
      cell: ({ row }) => (
        <RecordTableInlineCell>
          <Link
            to={categoryArticlesPath(row.original.topicId, row.original.id)}
            className="hover:underline"
          >
            {row.original.articleCount}
          </Link>
        </RecordTableInlineCell>
      ),
      size: 100,
    },
    {
      id: 'code',
      header: () => <RecordTable.InlineHead label={t('kb-code', 'Code')} icon={IconCode} />,
      cell: ({ row }) => <TextCell value={row.original.code} />,
      size: 140,
    },
    {
      id: 'createdBy',
      header: () => (
        <RecordTable.InlineHead label={t('created-by', 'Created by')} icon={IconUser} />
      ),
      cell: ({ row }) => (
        <RecordTableInlineCell>
          <MemberLine id={row.original.createdBy} />
        </RecordTableInlineCell>
      ),
      size: 180,
    },
    {
      id: 'createdAt',
      header: () => (
        <RecordTable.InlineHead label={t('created-at', 'Created at')} icon={IconCalendarPlus} />
      ),
      cell: ({ row }) => <DateCell date={row.original.createdAt} />,
      size: 140,
    },
  ];
};

/** Deletes the selected categories with their articles. */
const CategoriesCommandBar = () => {
  const { deleteCategories, isPending } = useDeleteCategories();

  return (
    <SelectionBar>
      {(selected, clear) => (
        <DeleteButton disabled={isPending} onClick={() => void deleteCategories(selected, clear)} />
      )}
    </SelectionBar>
  );
};

/** What the categories list's filter bar offers; the API applies it (`categories.ts`). */
const useFields = (topicId: string): TListFilterField[] => {
  const { t } = useTranslation('frontline');
  const all = useCategories(topicId).data ?? [];

  return [
    { path: 'subject.title', label: t('title', 'Title'), type: 'text', icon: IconLetterCase },
    {
      path: 'subject.description',
      label: t('description', 'Description'),
      type: 'text',
      icon: IconFileDescription,
    },
    { path: 'subject.code', label: t('kb-code', 'Code'), type: 'text', icon: IconCode },
    {
      path: 'subject.parentId',
      label: t('kb-parent-category', 'Parent category'),
      type: 'select',
      icon: IconFolderUp,
      options: all.map((row) => ({ value: row.id, label: row.title })),
    },
    { path: 'subject.createdBy', label: t('created-by', 'Created by'), type: 'member' },
    {
      path: 'subject.createdAt',
      label: t('created-at', 'Created at'),
      type: 'date',
      icon: IconCalendarPlus,
    },
  ];
};

/**
 * A topic's categories as a tree under core's list bar, each counting the articles in it and
 * under it. A filtered list keeps the tree of what matches.
 */
export const CategoriesPage = () => {
  const { t } = useTranslation('frontline');
  const topicId = useParams().topicId ?? '';
  const can = useKbAccess();
  const { openNew } = useOpenRecord();
  const { data: rows = [], isPending, error } = useCategories(topicId, useListFilterParams());
  const columns = useColumns();

  return (
    <PageContainer>
      <OldLink param="editId" contentType={KB_CATEGORY_TYPE} />
      <KbHeader topicId={topicId} label={t('kb-categories', 'Categories')}>
        <CreateButton
          allowed={can.categories}
          label={t('kb-new-category', 'New category')}
          onClick={() => openNew(KB_CATEGORY_TYPE, { topicId })}
        />
      </KbHeader>
      <ViewBar allLabel={t('kb-all-categories', 'All categories')}>
        <ListFilter
          id="frontline-kb-categories"
          fields={useFields(topicId)}
          members={memberQueries}
          totalCount={isPending ? undefined : rows.length}
        />
      </ViewBar>
      {error ? (
        <ListError error={error} />
      ) : !isPending && rows.length === 0 ? (
        <ListEmpty
          icon={<IconFolder />}
          title={t('kb-no-categories-yet', 'No categories yet')}
          description={t(
            'kb-no-categories-description',
            "Group this topic's articles into categories.",
          )}
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_kb_categories"
          columns={columns}
          data={rows}
          stickyColumns={['more', 'checkbox', 'title']}
          className="m-3"
        >
          <Rows isPending={isPending} />
          {can.categories && <CategoriesCommandBar />}
        </RecordTable.Provider>
      )}
    </PageContainer>
  );
};
