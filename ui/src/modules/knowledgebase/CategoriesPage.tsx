import {
  IconArticle,
  IconCalendarPlus,
  IconCode,
  IconEdit,
  IconFileDescription,
  IconFolder,
  IconLabelFilled,
  IconTrash,
} from '@tabler/icons-react';
import {
  IconComponent,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { useSearch } from '~/shared/hooks.ts';
import { CreateButton, ListEmpty, SearchSubHeader } from '~/shared/List.tsx';
import { DeleteButton, RowActions, SelectionBar, TextCell } from '~/shared/Records.tsx';
import { DateCell } from '~/shared/Table.tsx';
import { Indent } from './CategoryTree.tsx';
import { useDeleteCategories } from './useKbDeletes.ts';
import {
  type CategoryRow,
  KB_PATH,
  useCategories,
  useOldLink,
  useKbAccess,
  useKbPanels,
  useKbRoute,
} from './useKnowledgeBase.ts';

const articlesOf = (topicId: string, categoryId: string) =>
  `${KB_PATH}/${topicId}/articles?categoryId=${categoryId}`;

const MoreCell = ({ category }: { category: CategoryRow }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const { category: panel } = useKbPanels();
  const { deleteCategories } = useDeleteCategories();

  return (
    <RowActions
      label={t('kb-category-actions', 'Actions for {{title}}', { title: category.title })}
      actions={[
        {
          value: 'edit',
          icon: <IconEdit />,
          label: t('edit', 'Edit'),
          onSelect: () => panel.open(category.id),
        },
        {
          value: 'articles',
          icon: <IconArticle />,
          label: t('kb-view-articles', 'View articles'),
          onSelect: () => void navigate(articlesOf(category.topicId, category.id)),
        },
        {
          value: 'delete',
          icon: <IconTrash />,
          label: t('delete', 'Delete'),
          onSelect: () => void deleteCategories([category]),
        },
      ]}
    />
  );
};

/** The title under its parent, indented by depth, opening the category's panel for managers. */
const TitleCell = ({ category, indent }: { category: CategoryRow; indent: boolean }) => {
  const can = useKbAccess();
  const { category: panel } = useKbPanels();

  return (
    <RecordTableInlineCell>
      {indent && <Indent depth={category.depth} />}
      {category.icon && <IconComponent name={category.icon} className="size-4 shrink-0" />}
      {can.categories ? (
        <button
          type="button"
          className="truncate hover:underline"
          onClick={() => panel.open(category.id)}
        >
          {category.title}
        </button>
      ) : (
        <span className="truncate">{category.title}</span>
      )}
    </RecordTableInlineCell>
  );
};

const useColumns = (indent: boolean): RecordTableColumnDef<CategoryRow>[] => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();

  const manage: RecordTableColumnDef<CategoryRow>[] = [
    { id: 'more', cell: ({ row }) => <MoreCell category={row.original} />, size: 33 },
    RecordTable.checkboxColumnOf<CategoryRow>(),
  ];

  return [
    ...(can.categories ? manage : []),
    {
      id: 'title',
      header: () => <RecordTable.InlineHead label={t('title', 'Title')} icon={IconLabelFilled} />,
      cell: ({ row }) => <TitleCell category={row.original} indent={indent} />,
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
          <Link to={articlesOf(row.original.topicId, row.original.id)} className="hover:underline">
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
        <DeleteButton
          disabled={isPending}
          onClick={() =>
            void deleteCategories(
              selected.map((id) => ({ id })),
              clear,
            )
          }
        />
      )}
    </SelectionBar>
  );
};

/** A topic's categories as a tree, each counting the articles in it and under it. Search lists matches flat. */
export const CategoriesPage = () => {
  const { t } = useTranslation('frontline');
  const { topicId } = useKbRoute();
  const can = useKbAccess();
  const { category: panel } = useKbPanels();
  const search = useSearch()?.toLowerCase();
  const { data = [], isPending, error } = useCategories(topicId);
  const rows = search ? data.filter((row) => row.title.toLowerCase().includes(search)) : data;
  const columns = useColumns(!search);

  useOldLink('editId', panel.open);

  return (
    <>
      <SearchSubHeader
        id="frontline-kb-categories-filter"
        count={search ? rows.length : undefined}
      />
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && rows.length === 0 ? (
        <ListEmpty
          icon={<IconFolder />}
          title={t('kb-no-categories-yet', 'No categories yet')}
          description={t(
            'kb-no-categories-description',
            "Group this topic's articles into categories.",
          )}
          action={
            <CreateButton
              allowed={can.categories}
              label={t('kb-new-category', 'New Category')}
              onClick={() => panel.open('new')}
            />
          }
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_kb_categories"
          columns={columns}
          data={rows}
          stickyColumns={['more', 'checkbox', 'title']}
          className="m-3"
        >
          <RecordTable.Scroll>
            <RecordTable>
              <RecordTable.Header />
              <RecordTable.Body>
                {isPending && <RecordTable.RowSkeleton rows={10} />}
                <RecordTable.RowList />
              </RecordTable.Body>
            </RecordTable>
          </RecordTable.Scroll>
          {can.categories && <CategoriesCommandBar />}
        </RecordTable.Provider>
      )}
    </>
  );
};
