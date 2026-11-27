import { IconDots, IconArticle, IconFolders, IconSettings, IconTrash } from '@tabler/icons-react';
import { Button, buttonVariants, Skeleton } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { ActionsMenu, type RowAction } from '~/shared/Records.tsx';
import { useDeleteTopics } from './useKbDeletes.ts';
import {
  articlePath,
  type Topic,
  topicPath,
  useKbAccess,
  useLanguageName,
} from './useKnowledgeBase.ts';

const GRID = 'grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3';

/** The topic's settings, its categories, and delete for who manages topics. */
const TopicMenu = ({ topic }: { topic: Topic }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const can = useKbAccess();
  const { deleteTopics } = useDeleteTopics();

  const actions: RowAction[] = [
    {
      value: 'settings',
      icon: <IconSettings />,
      label: t('settings', 'Settings'),
      onSelect: () => void navigate(topicPath(topic.id, 'settings')),
    },
    {
      value: 'categories',
      icon: <IconFolders />,
      label: t('kb-categories', 'Categories'),
      onSelect: () => void navigate(topicPath(topic.id, 'categories')),
    },
    ...(can.topics
      ? [
          {
            value: 'delete',
            icon: <IconTrash />,
            label: t('delete', 'Delete'),
            onSelect: () => void deleteTopics([topic.id]),
          },
        ]
      : []),
  ];

  return (
    <ActionsMenu
      trigger={
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={t('kb-topic-actions', 'Actions for {{title}}', { title: topic.title })}
        >
          <IconDots />
        </Button>
      }
      actions={actions}
    />
  );
};

/** One topic: the whole card opens its articles, as the old knowledge base's topic did. */
const TopicCard = ({ topic }: { topic: Topic }) => {
  const { t } = useTranslation('frontline');
  const language = useLanguageName();

  const facts = [
    t('kb-article-count', {
      defaultValue_one: '{{count}} article',
      defaultValue_other: '{{count}} articles',
      count: topic.articleCount,
    }),
    t('kb-category-count', {
      defaultValue_one: '{{count}} category',
      defaultValue_other: '{{count}} categories',
      count: topic.categoryCount,
    }),
    topic.languageCode && language(topic.languageCode),
  ].filter(Boolean);

  return (
    <li className="relative flex flex-col gap-2 rounded-lg border bg-card p-4 shadow-xs transition-colors hover:border-primary/50 has-focus-visible:ring-1">
      <span className="flex items-center gap-2">
        <Link
          to={topicPath(topic.id, 'articles')}
          className="flex-1 truncate font-medium after:absolute after:inset-0 focus-visible:outline-hidden"
        >
          {topic.title}
        </Link>
        <TopicMenu topic={topic} />
      </span>
      {topic.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{topic.description}</p>
      )}
      <LatestArticles topic={topic} />
      <p className="mt-auto pt-1 text-xs text-muted-foreground">{facts.join(' · ')}</p>
    </li>
  );
};

/**
 * The topic's last changed articles, each opening in core's side panel above the card's own
 * link, or a line saying it has none yet.
 */
const LatestArticles = ({ topic }: { topic: Topic }) => {
  const { t } = useTranslation('frontline');

  if (topic.latestArticles.length === 0)
    return (
      <p className="border-t pt-3 text-sm text-muted-foreground">
        {t('kb-no-articles-yet', 'No articles yet')}
      </p>
    );

  return (
    <ul
      aria-label={t('kb-latest-articles', 'Latest articles in {{title}}', { title: topic.title })}
      className="flex flex-col gap-0.5 border-t pt-2"
    >
      {topic.latestArticles.map((article) => (
        <li key={article.id} className="flex min-w-0">
          <Link
            to={articlePath(article.id)}
            className={buttonVariants({
              variant: 'ghost',
              size: 'sm',
              className: 'relative min-w-0 justify-start',
            })}
          >
            <IconArticle className="text-muted-foreground" />
            <span className="truncate">{article.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
};

/** The topics as cards, three to a row on a wide page; placeholders while they load. */
export const TopicCards = ({ topics, isPending }: { topics: Topic[]; isPending: boolean }) => (
  <div className="min-h-0 flex-1 overflow-y-auto">
    {isPending ? (
      <div className={GRID}>
        <Skeleton radius="lg" className="h-48" />
        <Skeleton radius="lg" className="h-48" />
        <Skeleton radius="lg" className="h-48" />
      </div>
    ) : (
      <ul className={GRID}>
        {topics.map((topic) => (
          <TopicCard key={topic.id} topic={topic} />
        ))}
      </ul>
    )}
  </div>
);
