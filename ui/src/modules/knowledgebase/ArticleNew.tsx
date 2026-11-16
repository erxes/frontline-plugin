import { IconFolder, IconLetterCase, IconNotes, IconProgressCheck } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { PanelFormLayout, PanelFormRow, Select, type TRecordDraftProps } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { textOf } from '~/shared/hooks.ts';
import { TextRow } from '~/shared/TextRow.tsx';
import { CategorySelect } from './CategoryTree.tsx';
import {
  ARTICLE_STATUSES,
  type ArticleStatus,
  useCategories,
  useKbChange,
  useStatusNames,
} from './useKnowledgeBase.ts';

/** A new article's status; scheduling needs a time, so it is set on the article. */
const NewStatusSelect = ({
  value,
  onChange,
}: {
  value: ArticleStatus;
  onChange: (status: ArticleStatus) => void;
}) => {
  const { t } = useTranslation('frontline');
  const statuses = useStatusNames();

  return (
    <Select
      value={value}
      onValueChange={(next) =>
        onChange(ARTICLE_STATUSES.find((status) => status === next) ?? 'draft')
      }
    >
      <Select.Trigger aria-label={t('status', 'Status')}>
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        {ARTICLE_STATUSES.filter((status) => status !== 'scheduled').map((status) => (
          <Select.Item key={status} value={status}>
            {statuses[status]}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};

/**
 * A new article in core's side panel: its title, category, summary and status. Nothing saves
 * until Save; the article then takes the draft's place, and its body is written in its Content
 * tab. Scheduling needs a time, so it is set on the article.
 */
export const ArticleNew = ({ defaults, onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  // The topic the opener writes in: `openNew(KB_ARTICLE_TYPE, { topicId })`.
  const topicId = textOf(defaults.topicId);
  const categories = useCategories(topicId).data;
  const first = categories?.[0]?.id ?? '';
  const [picked, setCategoryId] = useState<string | null>(null);
  const [status, setStatus] = useState<ArticleStatus>('draft');
  const categoryId = picked ?? first;
  const { onSuccess } = useKbChange();

  const create = useMutation(
    orpc.knowledgebase.articles.create.mutationOptions({
      onSuccess: async (article) => {
        await onSuccess();
        onCreated(article.id);
      },
    }),
  );

  // onSubmit rather than a form action, which would clear the fields when the API refuses them.
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    create.mutate({
      categoryId,
      status,
      title: textOf(form.get('title')),
      summary: textOf(form.get('summary')),
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={create.isPending}
        saveLabel={t('kb-create-article', 'Create article')}
      >
        <TextRow
          label={t('title', 'Title')}
          icon={IconLetterCase}
          name="title"
          required
          placeholder={t('kb-enter-article-title', 'Enter article title')}
        />
        <PanelFormRow
          label={t('kb-category', 'Category')}
          icon={IconFolder}
          required
          error={
            categories?.length === 0
              ? t('kb-category-first', 'Add a category to this topic before its first article.')
              : undefined
          }
        >
          <CategorySelect
            topicId={topicId}
            value={categoryId}
            onChange={setCategoryId}
            label={t('kb-category', 'Category')}
          />
        </PanelFormRow>
        <TextRow label={t('kb-summary', 'Summary')} icon={IconNotes} name="summary" multiline />
        <PanelFormRow label={t('status', 'Status')} icon={IconProgressCheck}>
          <NewStatusSelect value={status} onChange={setStatus} />
        </PanelFormRow>
        {create.error && (
          <p role="alert" className="text-xs text-destructive-text">
            {create.error.message}
          </p>
        )}
      </PanelFormLayout>
    </form>
  );
};
