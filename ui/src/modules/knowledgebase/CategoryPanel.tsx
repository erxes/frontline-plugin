import {
  IconAlignLeft,
  IconArticle,
  IconBook,
  IconCalendarPlus,
  IconCode,
  IconDots,
  IconFolderUp,
  IconIcons,
  IconLetterCase,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  IconPicker,
  PanelField,
  PanelSection,
  Skeleton,
  TextField,
  type TRecordSlotProps,
  useFormat,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { InfoRow, PanelSkeleton, PageLink, ReadOnly } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { ParentSelect, TopicSelect } from './CategoryTree.tsx';
import { useDeleteCategories } from './useKbDeletes.ts';
import {
  type Category,
  categoryArticlesPath,
  useCategory,
  useKbAccess,
  useKbChange,
} from './useKnowledgeBase.ts';
import { MemberChip } from '~/shared/Person.tsx';

/** The panel header's title: the category's title. */
export const CategoryTitle = ({ contentId }: TRecordSlotProps) => {
  const category = useCategory(contentId);

  if (category.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{category.data?.title ?? category.error?.message}</span>;
};

/** The header's menu: the category's articles, and deleting it for category managers. */
export const CategoryActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();
  const navigate = useNavigate();
  const category = useCategory(contentId).data;
  const { deleteCategories } = useDeleteCategories();

  if (!category) return null;

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('kb-category-menu', 'Category actions')}>
          <IconDots />
        </Button>
      }
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
                value: 'delete',
                icon: <IconTrash />,
                label: t('delete', 'Delete'),
                onSelect: () => void deleteCategories([contentId]),
              },
            ]
          : []),
      ]}
    />
  );
};

type CategoryEdit = {
  title?: string;
  description?: string;
  code?: string;
  icon?: string | null;
  topicId?: string;
  parentId?: string | null;
};

/** The category's fields, edited in place by category managers. */
const CategoryFields = ({ category }: { category: Category }) => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();
  const update = useMutation(orpc.knowledgebase.categories.update.mutationOptions(useKbChange()));
  const edit = (fields: CategoryEdit) => update.mutate({ id: category.id, ...fields });
  const scope = `frontline-kb-category.${category.id}`;

  return (
    <ReadOnly when={!can.categories}>
      <PanelField icon={IconLetterCase} label={t('title', 'Title')}>
        <TextField
          scope={`${scope}.title`}
          value={category.title}
          placeholder={t('title', 'Title')}
          onSave={(title) => {
            const next = title.trim();

            if (next && next !== category.title) edit({ title: next });
          }}
        />
      </PanelField>
      <PanelField icon={IconAlignLeft} label={t('description', 'Description')}>
        <TextField
          scope={`${scope}.description`}
          value={category.description ?? ''}
          placeholder={t('description', 'Description')}
          onSave={(description) => edit({ description })}
        />
      </PanelField>
      <PanelField icon={IconCode} label={t('kb-code', 'Code')}>
        <TextField
          scope={`${scope}.code`}
          value={category.code ?? ''}
          placeholder={t('kb-code', 'Code')}
          onSave={(code) => edit({ code })}
        />
      </PanelField>
      <PanelField icon={IconIcons} label={t('icon', 'Icon')} cell={false}>
        <IconPicker
          aria-label={t('icon', 'Icon')}
          value={category.icon ?? undefined}
          onValueChange={(icon) => edit({ icon })}
          className="w-min"
        />
      </PanelField>
      <PanelField icon={IconFolderUp} label={t('kb-parent-category', 'Parent category')}>
        <ParentSelect
          topicId={category.topicId}
          categoryId={category.id}
          value={category.parentId}
          onChange={(parentId) => edit({ parentId })}
        />
      </PanelField>
      {/* Moving to another topic takes its subcategories and articles along, to the top level. */}
      <PanelField icon={IconBook} label={t('kb-topic', 'Topic')}>
        <TopicSelect value={category.topicId} onChange={(topicId) => edit({ topicId })} />
      </PanelField>
    </ReadOnly>
  );
};

/** The Detail tab: the category's fields, its articles and who made it. */
export const CategoryDetail = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const category = useCategory(contentId);

  if (category.isPending) return <PanelSkeleton />;

  if (category.isError)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {category.error.message}
      </p>
    );

  const { data } = category;

  return (
    <PanelSection title={t('kb-category', 'Category')}>
      <CategoryFields category={data} />
      <PanelField icon={IconArticle} label={t('articles', 'Articles')} cell={false}>
        <PageLink
          to={categoryArticlesPath(data.topicId, data.id)}
          label={t('kb-view-articles', 'View articles')}
          count={data.articleCount}
        />
      </PanelField>
      <InfoRow icon={IconUser} label={t('created-by', 'Created by')}>
        <MemberChip id={data.createdBy} />
      </InfoRow>
      <InfoRow icon={IconCalendarPlus} label={t('created-at', 'Created at')}>
        {format.dateTime(data.createdAt)}
      </InfoRow>
    </PanelSection>
  );
};
