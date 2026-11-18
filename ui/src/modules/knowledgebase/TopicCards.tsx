import { IconDots, IconFolders, IconInfoCircle, IconTrash } from '@tabler/icons-react';
import { Button, Skeleton, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { KB_TOPIC_TYPE } from '~/plugin.ts';
import { ActionsMenu, type RowAction } from '~/shared/Records.tsx';
import { useDeleteTopics } from './useKbDeletes.ts';
import { type Topic, topicPath, useKbAccess, useLanguageName } from './useKnowledgeBase.ts';

const GRID = 'grid grid-cols-1 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-3';

/** The topic's details in core's side panel, its categories, and delete for who manages topics. */
const TopicMenu = ({ topic }: { topic: Topic }) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();
  const navigate = useNavigate();
  const can = useKbAccess();
  const { deleteTopics } = useDeleteTopics();

  const actions: RowAction[] = [
    {
      value: 'details',
      icon: <IconInfoCircle />,
      label: t('kb-topic-details', 'Topic details'),
      onSelect: () => open({ contentType: KB_TOPIC_TYPE, contentId: topic.id }),
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
      <p className="mt-auto pt-3 text-xs text-muted-foreground">{facts.join(' · ')}</p>
    </li>
  );
};

/** The topics as cards, three to a row on a wide page; placeholders while they load. */
export const TopicCards = ({ topics, isPending }: { topics: Topic[]; isPending: boolean }) => (
  <div className="min-h-0 flex-1 overflow-y-auto">
    {isPending ? (
      <div className={GRID}>
        <Skeleton radius="lg" className="h-32" />
        <Skeleton radius="lg" className="h-32" />
        <Skeleton radius="lg" className="h-32" />
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
