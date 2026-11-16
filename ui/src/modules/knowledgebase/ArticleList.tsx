import { memberQueries } from '@erxes/core-contract/client';
import { IconDots } from '@tabler/icons-react';
import {
  Button,
  MemberInline,
  RecordList,
  type RecordListGroup,
  RelativeDateDisplay,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { ActionsMenu } from '~/shared/Records.tsx';
import { ArticleTitle, CategoryPicker, useArticleActions } from './ArticleCells.tsx';
import { ARTICLE_STATUSES, type Article, useStatusNames } from './useKnowledgeBase.ts';

const RowMenu = ({ article }: { article: Article }) => {
  const { t } = useTranslation('frontline');
  const actions = useArticleActions(article);

  if (actions.length === 0) return null;

  return (
    <ActionsMenu
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('kb-article-actions', 'Actions for {{title}}', { title: article.title })}
        >
          <IconDots />
        </Button>
      }
      actions={actions}
    />
  );
};

/** One article: its title, category, author, when it last changed, and its menu. */
const ArticleRow = ({ article, topicId }: { article: Article; topicId: string }) => (
  <div className="flex min-w-0 flex-1 items-center gap-3 text-xs">
    <span className="flex min-w-0 flex-1">
      <ArticleTitle article={article} />
    </span>
    <span className="w-44 shrink-0">
      <CategoryPicker article={article} topicId={topicId} />
    </span>
    <span className="hidden w-36 shrink-0 md:block">
      <MemberInline memberId={article.createdBy} members={memberQueries} />
    </span>
    <span className="w-24 shrink-0 text-muted-foreground">
      <RelativeDateDisplay value={article.updatedAt.toISOString()}>
        <RelativeDateDisplay.Value value={article.updatedAt.toISOString()} />
      </RelativeDateDisplay>
    </span>
    <RowMenu article={article} />
  </div>
);

/**
 * The articles grouped by status, draft to archived, each group under a header that folds it
 * away. Inside `RecordList.Provider`, whose selection the bulk bar reads.
 */
export const ArticleList = ({ articles, topicId }: { articles: Article[]; topicId: string }) => {
  const statuses = useStatusNames();
  const byStatus = Map.groupBy(articles, (article) => article.status);

  const groups: RecordListGroup<Article>[] = ARTICLE_STATUSES.flatMap((status) => {
    const rows = byStatus.get(status) ?? [];

    return rows.length === 0 ? [] : [{ id: status, label: statuses[status], rows }];
  });

  return (
    <RecordList
      groups={groups}
      rowId={(article) => article.id}
      rowLabel={(article) => article.title}
      renderRow={(article) => <ArticleRow article={article} topicId={topicId} />}
    />
  );
};
