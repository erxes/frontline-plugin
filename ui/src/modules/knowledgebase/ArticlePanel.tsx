import {
  IconCalendarPlus,
  IconCalendarUp,
  IconDots,
  IconEye,
  IconFolder,
  IconLetterCase,
  IconNotes,
  IconUser,
  IconWorldUpload,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  PanelDescriptionEditor,
  PanelField,
  PanelSection,
  Skeleton,
  Spinner,
  TextField,
  type TRecordSlotProps,
  useFormat,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { InfoRow, ReadOnly } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { useArticleActions } from './ArticleCells.tsx';
import { type ArticleEdit, Media, Publishing } from './ArticleOptions.tsx';
import { CategorySelect } from './CategoryTree.tsx';
import { type ArticleDetail, useArticle, useKbAccess, useKbChange } from './useKnowledgeBase.ts';
import { MemberLine } from '~/shared/MemberLine.tsx';

/** Saves one change to the article at a time, refetching the lists after it. */
const useEditArticle = (article: ArticleDetail) => {
  const update = useMutation(orpc.knowledgebase.articles.update.mutationOptions(useKbChange()));

  return (fields: ArticleEdit) => update.mutate({ id: article.id, ...fields });
};

/** The panel header's title: the article's title. */
export const ArticleTitleSlot = ({ contentId }: TRecordSlotProps) => {
  const article = useArticle(contentId);

  if (article.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{article.data?.title ?? article.error?.message}</span>;
};

const ArticleMenu = ({ article }: { article: ArticleDetail }) => {
  const { t } = useTranslation('frontline');
  const actions = useArticleActions(article);

  if (actions.length === 0) return null;

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('kb-article-menu', 'Article actions')}>
          <IconDots />
        </Button>
      }
      actions={actions}
    />
  );
};

/** The header's menu, for article managers: copy or delete it. */
export const ArticleActions = ({ contentId }: TRecordSlotProps) => {
  const article = useArticle(contentId).data;

  return article ? <ArticleMenu article={article} /> : null;
};

/** The article's title, summary and category. */
const General = ({ article }: { article: ArticleDetail }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditArticle(article);
  const scope = `frontline-kb-article.${article.id}`;

  return (
    <PanelSection title={t('kb-article', 'Article')}>
      <PanelField icon={IconLetterCase} label={t('title', 'Title')}>
        <TextField
          scope={`${scope}.title`}
          value={article.title}
          placeholder={t('title', 'Title')}
          onSave={(title) => {
            const next = title.trim();

            if (next && next !== article.title) edit({ title: next });
          }}
        />
      </PanelField>
      <PanelField icon={IconNotes} label={t('kb-summary', 'Summary')}>
        <TextField
          scope={`${scope}.summary`}
          value={article.summary ?? ''}
          placeholder={t('kb-summary', 'Summary')}
          onSave={(summary) => edit({ summary })}
        />
      </PanelField>
      <PanelField icon={IconFolder} label={t('kb-category', 'Category')}>
        <CategorySelect
          topicId={article.topicId}
          value={article.categoryId}
          onChange={(categoryId) => edit({ categoryId })}
          label={t('kb-category', 'Category')}
          flush
        />
      </PanelField>
    </PanelSection>
  );
};

/** Who wrote it, when it changed and went live, and how often it was read. */
const History = ({ article }: { article: ArticleDetail }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  const at = (label: string, icon: typeof IconCalendarPlus, date: Date | null) =>
    date && (
      <InfoRow icon={icon} label={label}>
        {format.dateTime(date)}
      </InfoRow>
    );

  return (
    <PanelSection title={t('kb-history', 'History')}>
      <InfoRow icon={IconEye} label={t('kb-views', 'Views')}>
        {article.viewCount}
      </InfoRow>
      {at(t('kb-published-at', 'Published at'), IconWorldUpload, article.publishedAt)}
      <InfoRow icon={IconUser} label={t('created-by', 'Created by')}>
        <MemberLine id={article.createdBy} />
      </InfoRow>
      {at(t('created-at', 'Created at'), IconCalendarPlus, article.createdAt)}
      {at(t('updated-at', 'Updated at'), IconCalendarUp, article.updatedAt)}
    </PanelSection>
  );
};

/** The article's fields, each saved as soon as it changes. */
const ArticleFields = ({ article }: { article: ArticleDetail }) => {
  const can = useKbAccess();
  const edit = useEditArticle(article);

  return (
    <>
      <ReadOnly when={!can.articles}>
        <General article={article} />
        <Publishing article={article} edit={edit} />
        <Media article={article} edit={edit} />
      </ReadOnly>
      <History article={article} />
    </>
  );
};

/** The Detail tab: the article's fields, publishing, files and history. */
export const ArticleDetailSlot = ({ contentId }: TRecordSlotProps) => {
  const article = useArticle(contentId);

  if (article.isPending) return <Spinner area="lg" />;

  if (article.isError)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {article.error.message}
      </p>
    );

  return <ArticleFields article={article.data} />;
};

const ContentEditor = ({ article }: { article: ArticleDetail }) => {
  const can = useKbAccess();
  const edit = useEditArticle(article);

  return (
    <PanelDescriptionEditor
      value={article.content}
      scope={`frontline-kb-article.${article.id}.content`}
      readonly={!can.articles}
      isHTML
      onSave={(content) => edit({ content })}
    />
  );
};

/** The Content tab: the article's body, rich text saved when the editor loses focus. */
export const ArticleContent = ({ contentId }: TRecordSlotProps) => {
  const article = useArticle(contentId);

  if (article.isPending) return <Spinner area="lg" />;

  if (article.isError)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {article.error.message}
      </p>
    );

  return <ContentEditor key={article.data.id} article={article.data} />;
};
