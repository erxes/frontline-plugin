import { IconFolder } from '@tabler/icons-react';
import {
  Input,
  PageContainer,
  PanelDescriptionEditor,
  PanelField,
  PanelSection,
  ScrollArea,
  Skeleton,
} from 'erxes-ui';
import { type FocusEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ListError } from '~/shared/List.tsx';
import { ReadOnly } from '~/shared/Panel.tsx';
import { Media, Publishing } from './ArticleOptions.tsx';
import { ArticleMenu, History, useEditArticle } from './ArticlePanel.tsx';
import { CategorySelect } from './CategoryTree.tsx';
import { KbHeader } from './KbHeader.tsx';
import { type ArticleDetail, useArticle, useKbAccess } from './useKnowledgeBase.ts';

/**
 * A line of the article's head typed in place, saved when it loses focus: the title can't be
 * left empty, the summary can.
 */
const HeadText = ({
  value,
  label,
  required,
  title,
  onSave,
}: {
  value: string;
  label: string;
  required?: boolean;
  /** The article's name, in the type a record's name takes. */
  title?: boolean;
  onSave: (text: string) => void;
}) => {
  const [text, setText] = useState(value);

  const save = (event: FocusEvent<HTMLInputElement>) => {
    const next = event.currentTarget.value.trim();

    if (required && !next) {
      setText(value);

      return;
    }

    if (next !== value) onSave(next);
  };

  return (
    <Input
      variant="flush"
      aria-label={label}
      placeholder={label}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={save}
      text={title ? 'title' : 'default'}
    />
  );
};

/** The article as it is read: its title, summary and body, each saved as it is left. */
const Body = ({ article, editable }: { article: ArticleDetail; editable: boolean }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditArticle(article);

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-1 px-6 py-8">
      <fieldset disabled={!editable} className="contents">
        <HeadText
          value={article.title}
          label={t('title', 'Title')}
          required
          title
          onSave={(title) => edit({ title })}
        />
        <HeadText
          value={article.summary ?? ''}
          label={t('kb-summary', 'Summary')}
          onSave={(summary) => edit({ summary })}
        />
      </fieldset>
      <div className="mt-3 min-h-96 border-t pt-2">
        <PanelDescriptionEditor
          value={article.content}
          scope={`frontline-kb-article-page.${article.id}.content`}
          readonly={!editable}
          isHTML
          onSave={(content) => edit({ content })}
        />
      </div>
    </article>
  );
};

/** The article's category, publishing, files and history, beside its body. */
const Properties = ({ article, editable }: { article: ArticleDetail; editable: boolean }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditArticle(article);

  return (
    <aside
      aria-label={t('kb-article-properties', 'Article properties')}
      className="flex shrink-0 flex-col border-t lg:w-96 lg:border-t-0 lg:border-l"
    >
      <ScrollArea className="min-h-0 flex-1">
        <ReadOnly when={!editable}>
          <PanelSection title={t('kb-article', 'Article')}>
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
          <Publishing article={article} edit={edit} />
          <Media article={article} edit={edit} />
        </ReadOnly>
        <History article={article} />
      </ScrollArea>
    </aside>
  );
};

/**
 * An article on a page of its own, written at full width as a document: its title, summary and
 * body in the middle, and its category, publishing, files and history in a column beside them,
 * each saved as it changes.
 */
export const ArticlePage = () => {
  const { t } = useTranslation('frontline');
  const id = useParams().id ?? '';
  const article = useArticle(id);
  const can = useKbAccess();

  return (
    <PageContainer>
      <KbHeader topicId={article.data?.topicId} label={article.data?.title ?? '…'}>
        {article.data && <ArticleMenu article={article.data} />}
      </KbHeader>
      {article.error ? (
        <ListError error={article.error} retry={() => void article.refetch()} />
      ) : !article.data ? (
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-8" aria-busy>
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <ScrollArea className="min-w-0 flex-1">
            <Body key={article.data.id} article={article.data} editable={can.articles} />
          </ScrollArea>
          <Properties article={article.data} editable={can.articles} />
        </div>
      )}
      <span className="sr-only">{t('kb-article', 'Article')}</span>
    </PageContainer>
  );
};
