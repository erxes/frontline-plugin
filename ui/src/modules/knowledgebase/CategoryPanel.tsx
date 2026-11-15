import { useMutation } from '@tanstack/react-query';
import { IconPicker, Input, Select, Skeleton, Textarea } from 'erxes-ui';
import { type SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { draftsOf, FormActions } from '~/shared/Drafts.tsx';
import { Field, SidePanel } from '~/shared/SidePanel.tsx';
import { CategoryOptions } from './CategoryTree.tsx';
import { CodeField, type SaveError } from './TopicFields.tsx';
import {
  type Category,
  subtreeOf,
  useCategories,
  useCategory,
  useKbChange,
  useKbPanels,
  useKbRoute,
  useTopics,
} from './useKnowledgeBase.ts';

type CategoryDraft = {
  title: string;
  description: string;
  code: string;
  icon: string;
  topicId: string;
  /** Empty puts the category at its topic's top level. */
  parentId: string;
};

const useCategoryDraft = draftsOf<CategoryDraft>();

const NO_PARENT = 'none';

/** The topic the category is in, and the category above it there. */
const Placement = ({
  value,
  onChange,
  categoryId,
}: {
  value: CategoryDraft;
  onChange: (patch: Partial<CategoryDraft>) => void;
  categoryId?: string;
}) => {
  const { t } = useTranslation('frontline');
  const topics = useTopics().data?.topics ?? [];
  const rows = useCategories(value.topicId).data ?? [];
  const below = categoryId ? subtreeOf(rows, categoryId) : [];

  return (
    <>
      <Field
        id="category-topic"
        label={t('knowledge-base', 'Knowledge Base')}
        hint={t('kb-move-category-help', 'Its subcategories and articles move with it.')}
      >
        <Select
          value={value.topicId}
          onValueChange={(topicId) => onChange({ topicId, parentId: '' })}
        >
          <Select.Trigger id="category-topic">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {topics.map((topic) => (
              <Select.Item key={topic.id} value={topic.id}>
                {topic.title}
              </Select.Item>
            ))}
          </Select.Content>
        </Select>
      </Field>
      <Field id="category-parent" label={t('kb-parent-category', 'Parent category')}>
        <Select
          value={value.parentId || NO_PARENT}
          onValueChange={(parentId) =>
            onChange({ parentId: parentId === NO_PARENT ? '' : parentId })
          }
        >
          <Select.Trigger id="category-parent">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            <Select.Item value={NO_PARENT}>
              {t('kb-no-parent-category', 'No parent category')}
            </Select.Item>
            <CategoryOptions rows={rows.filter((row) => !below.includes(row.id))} depth={1} />
          </Select.Content>
        </Select>
      </Field>
    </>
  );
};

/** The category's icon, title, description and code. */
const Naming = ({
  value,
  onChange,
  error,
}: {
  value: CategoryDraft;
  onChange: (patch: Partial<CategoryDraft>) => void;
  error: SaveError;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <div className="flex gap-2">
        <Field id="category-icon" label={t('icon', 'Icon')}>
          <IconPicker
            id="category-icon"
            value={value.icon || undefined}
            onValueChange={(icon) => onChange({ icon: icon ?? '' })}
            className="w-min"
          />
        </Field>
        <Field id="category-title" label={t('title', 'Title')} className="flex-1">
          <Input
            id="category-title"
            required
            placeholder={t('kb-enter-category-title', 'Enter category title')}
            value={value.title}
            onChange={(event) => onChange({ title: event.target.value })}
          />
        </Field>
      </div>
      <Field id="category-description" label={t('description', 'Description')}>
        <Textarea
          id="category-description"
          placeholder={t('kb-enter-category-description', 'Enter category description')}
          value={value.description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </Field>
      <CodeField
        id="category-code"
        placeholder={t('kb-enter-category-code', 'Enter category code')}
        value={value.code}
        onChange={(code) => onChange({ code })}
        error={error}
      />
    </>
  );
};

type CategoryRecord = Omit<Category, 'articleCount'>;

const draftOf = (category: CategoryRecord | undefined, topicId: string): CategoryDraft => ({
  title: category?.title ?? '',
  description: category?.description ?? '',
  code: category?.code ?? '',
  icon: category?.icon ?? '',
  topicId: category?.topicId ?? topicId,
  parentId: category?.parentId ?? '',
});

/** A new category in the open topic, or a change to `category`; saving closes the panel. */
const CategoryForm = ({ category, topicId }: { category?: CategoryRecord; topicId: string }) => {
  const { t } = useTranslation('frontline');
  const { category: panel } = useKbPanels();
  const change = useKbChange();
  const draft = useCategoryDraft(category?.id ?? `new~${topicId}`, draftOf(category, topicId));

  const options = {
    ...change,
    onSuccess: async () => {
      draft.clear();
      await change.onSuccess();
      panel.close();
    },
  };

  const create = useMutation(orpc.knowledgebase.categories.create.mutationOptions(options));
  const update = useMutation(orpc.knowledgebase.categories.update.mutationOptions(options));
  const { error, isPending } = category ? update : create;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const fields = {
      ...draft.value,
      icon: draft.value.icon || null,
      parentId: draft.value.parentId || null,
    };

    if (category) update.mutate({ id: category.id, ...fields });
    else create.mutate(fields);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Naming value={draft.value} onChange={draft.change} error={error} />
      <Placement value={draft.value} onChange={draft.change} categoryId={category?.id} />
      <FormActions
        dirty={draft.dirty}
        onDiscard={draft.clear}
        disabled={isPending}
        submit={
          category
            ? t('kb-save-changes', 'Save Changes')
            : t('kb-create-category', 'Create Category')
        }
      />
    </form>
  );
};

const EditCategory = ({ id }: { id: string }) => {
  const { data, error } = useCategory(id);

  if (error) return <p className="text-sm text-destructive-text">{error.message}</p>;

  return data ? (
    <CategoryForm key={data.id} category={data} topicId={data.topicId} />
  ) : (
    <Skeleton className="h-60" />
  );
};

/** Create a category in the open topic, `?category=new`, or edit one, `?category=<id>`. */
export const CategoryPanel = () => {
  const { t } = useTranslation('frontline');
  const { category } = useKbPanels();
  const { topicId } = useKbRoute();

  return (
    <SidePanel
      open={Boolean(category.value)}
      onClose={category.close}
      title={
        category.value === 'new'
          ? t('kb-new-category', 'New Category')
          : t('kb-edit-category', 'Edit Category')
      }
      description={t('kb-category-hint', "A category groups a topic's articles.")}
    >
      {category.value === 'new' ? (
        <CategoryForm topicId={topicId} />
      ) : (
        category.value && <EditCategory id={category.value} />
      )}
    </SidePanel>
  );
};
