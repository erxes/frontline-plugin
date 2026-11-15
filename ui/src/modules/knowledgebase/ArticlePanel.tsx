import { useMutation } from '@tanstack/react-query';
import { Editor, Input, Select, Separator, Skeleton, Textarea } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { draftsOf, FormActions } from '~/shared/Drafts.tsx';
import { Field, SidePanel } from '~/shared/SidePanel.tsx';
import { type ArticleDraft, Media, Publishing } from './ArticleOptions.tsx';
import { CategoryOptions } from './CategoryTree.tsx';
import {
  type ArticleDetail,
  useArticle,
  useArticleFilters,
  useCategories,
  useKbChange,
  useKbPanels,
  useKbRoute,
} from './useKnowledgeBase.ts';

const useArticleDraft = draftsOf<ArticleDraft>();

const draftOf = (article: ArticleDetail | undefined, categoryId: string): ArticleDraft => ({
  title: article?.title ?? '',
  categoryId: article?.categoryId ?? categoryId,
  summary: article?.summary ?? '',
  content: article?.content ?? '',
  status: article?.status ?? 'draft',
  scheduledAt: article?.scheduledAt ?? null,
  isPrivate: article?.isPrivate ?? false,
  reactionChoices: article?.reactionChoices ?? [],
  image: article?.image ?? null,
  attachments: article?.attachments ?? [],
  pdfAttachment: article?.pdfAttachment ?? null,
});

/** The topic's categories to file the article under. */
const CategorySelect = ({ value, onChange }: { value: string; onChange: (id: string) => void }) => {
  const { topicId } = useKbRoute();
  const rows = useCategories(topicId).data ?? [];

  return (
    <Select value={value} onValueChange={onChange}>
      <Select.Trigger id="article-category">
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        <CategoryOptions rows={rows} />
      </Select.Content>
    </Select>
  );
};

/** The article's title, category, summary and content. */
const General = ({
  value,
  onChange,
}: {
  value: ArticleDraft;
  onChange: (patch: Partial<ArticleDraft>) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <Field id="article-title" label={t('title', 'Title')}>
        <Input
          id="article-title"
          required
          placeholder={t('kb-enter-article-title', 'Enter article title')}
          value={value.title}
          onChange={(event) => onChange({ title: event.target.value })}
        />
      </Field>
      <Field id="article-category" label={t('kb-category', 'Category')}>
        <CategorySelect
          value={value.categoryId}
          onChange={(categoryId) => onChange({ categoryId })}
        />
      </Field>
      <Field id="article-summary" label={t('kb-summary', 'Summary')}>
        <Textarea
          id="article-summary"
          placeholder={t('kb-enter-article-summary', 'Enter article summary')}
          value={value.summary}
          onChange={(event) => onChange({ summary: event.target.value })}
        />
      </Field>
      <Field label={t('content', 'Content')}>
        <Editor
          isHTML
          initialContent={value.content || undefined}
          onChange={(content) => onChange({ content })}
          label={t('content', 'Content')}
          variant="outline"
          className="min-h-60"
        />
      </Field>
    </>
  );
};

/** A new article in the filtered or first category, or a change to `article`; saving closes the panel. */
const ArticleForm = ({ article, categoryId }: { article?: ArticleDetail; categoryId: string }) => {
  const { t } = useTranslation('frontline');
  const { article: panel } = useKbPanels();
  const { topicId } = useKbRoute();
  const change = useKbChange();
  const draft = useArticleDraft(article?.id ?? `new~${topicId}`, draftOf(article, categoryId));
  // The editor reads its content once, so a discard mounts fresh fields.
  const [revision, setRevision] = useState(0);

  const options = {
    ...change,
    onSuccess: async () => {
      draft.clear();
      await change.onSuccess();
      panel.close();
    },
  };

  const create = useMutation(orpc.knowledgebase.articles.create.mutationOptions(options));
  const update = useMutation(orpc.knowledgebase.articles.update.mutationOptions(options));
  const { isPending } = article ? update : create;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (article) update.mutate({ id: article.id, ...draft.value });
    else create.mutate(draft.value);
  };

  const discard = () => {
    draft.clear();
    setRevision((current) => current + 1);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <General key={revision} value={draft.value} onChange={draft.change} />
      <Separator />
      <Publishing value={draft.value} onChange={draft.change} />
      <Separator />
      <Media value={draft.value} onChange={draft.change} />
      <FormActions
        dirty={draft.dirty}
        onDiscard={discard}
        disabled={isPending || !draft.value.categoryId}
        submit={
          article ? t('kb-save-changes', 'Save Changes') : t('kb-create-article', 'Create Article')
        }
      />
    </form>
  );
};

const EditArticle = ({ id }: { id: string }) => {
  const { data, error } = useArticle(id);

  if (error) return <p className="text-sm text-destructive-text">{error.message}</p>;

  return data ? (
    <ArticleForm key={data.id} article={data} categoryId={data.categoryId} />
  ) : (
    <Skeleton className="h-60" />
  );
};

/** Write an article in the open topic, `?article=new`, or edit one, `?article=<id>`. */
export const ArticlePanel = () => {
  const { t } = useTranslation('frontline');
  const { article } = useKbPanels();
  const { topicId } = useKbRoute();
  const { categoryId } = useArticleFilters();
  const categories = useCategories(topicId);

  return (
    <SidePanel
      open={Boolean(article.value)}
      onClose={article.close}
      title={
        article.value === 'new'
          ? t('kb-new-article', 'New Article')
          : t('kb-edit-article', 'Edit Article')
      }
      description={t('kb-article-hint', "An article readers find in the topic's help center.")}
    >
      {article.value === 'new' ? (
        categories.data ? (
          <ArticleForm
            key={`new~${topicId}`}
            categoryId={categoryId ?? categories.data[0]?.id ?? ''}
          />
        ) : (
          <Skeleton className="h-60" />
        )
      ) : (
        article.value && <EditArticle id={article.value} />
      )}
    </SidePanel>
  );
};
