import { IconArticle, IconBook, IconFolders, IconSettings } from '@tabler/icons-react';
import { useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { KB_ARTICLE_TYPE, KB_CATEGORY_TYPE } from '~/plugin.ts';
import { CreateButton } from '~/shared/List.tsx';
import {
  RecordWorkspace,
  WorkspaceHead,
  WorkspaceNav,
  type WorkspaceSection,
} from '~/shared/RecordWorkspace.tsx';
import { KbHeader } from './KbHeader.tsx';
import { TopicArticles } from './TopicArticles.tsx';
import { TopicCategories } from './TopicCategories.tsx';
import { TopicSettings } from './TopicSettings.tsx';
import {
  type Topic,
  TOPIC_SECTIONS,
  type TopicSection,
  topicPath,
  useKbAccess,
  useLanguageName,
  useTopic,
} from './useKnowledgeBase.ts';

/** The sections' names, icons and counts, in the member's language. */
const useSections = (topicId: string, topic: Topic | undefined) => {
  const { t } = useTranslation('frontline');
  const to = (section: TopicSection) => topicPath(topicId, section);

  return {
    articles: {
      to: to('articles'),
      label: t('articles', 'Articles'),
      icon: IconArticle,
      count: topic?.articleCount,
    },
    categories: {
      to: to('categories'),
      label: t('kb-categories', 'Categories'),
      icon: IconFolders,
      count: topic?.categoryCount,
    },
    settings: { to: to('settings'), label: t('settings', 'Settings'), icon: IconSettings },
  } satisfies Record<TopicSection, WorkspaceSection>;
};

/** The header's one action: a new article or category, drafted in core's side panel. */
const NewButton = ({ topicId, section }: { topicId: string; section: TopicSection }) => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();
  const { openNew } = useOpenRecord();

  if (section === 'articles')
    return (
      <CreateButton
        allowed={can.articles}
        label={t('kb-new-article', 'New article')}
        onClick={() => openNew(KB_ARTICLE_TYPE, { topicId })}
      />
    );

  if (section === 'categories')
    return (
      <CreateButton
        allowed={can.categories}
        label={t('kb-new-category', 'New category')}
        onClick={() => openNew(KB_CATEGORY_TYPE, { topicId })}
      />
    );

  return null;
};

const Section = ({ section, topic }: { section: TopicSection; topic: Topic }) => {
  const can = useKbAccess();

  switch (section) {
    case 'categories':
      return <TopicCategories topicId={topic.id} />;
    case 'settings':
      return <TopicSettings key={topic.id} topic={topic} editable={can.topics} />;
    default:
      return <TopicArticles topicId={topic.id} />;
  }
};

/**
 * A knowledge base topic on a page of its own: its articles, categories and settings in a
 * column beside the open one, as a channel's are.
 */
export const TopicPage = () => {
  const { t } = useTranslation('frontline');
  const { topicId = '', section: param } = useParams();
  const section = TOPIC_SECTIONS.find((one) => one === param) ?? 'articles';
  const topic = useTopic(topicId);
  const sections = useSections(topicId, topic.data);
  const language = useLanguageName();

  return (
    <RecordWorkspace
      header={
        <KbHeader topicId={topicId} label={sections[section].label}>
          <NewButton topicId={topicId} section={section} />
        </KbHeader>
      }
      error={topic.error}
      retry={() => void topic.refetch()}
      width={section === 'settings' ? 'settings' : 'flush'}
      nav={
        topic.data && (
          <WorkspaceNav
            label={t('kb-topic', 'Topic')}
            head={
              <WorkspaceHead
                to={topicPath(topicId)}
                mark={<IconBook />}
                title={topic.data.title}
                subtitle={
                  topic.data.description ||
                  (topic.data.languageCode ? language(topic.data.languageCode) : undefined)
                }
              />
            }
            sections={TOPIC_SECTIONS.map((one) => sections[one])}
          />
        )
      }
    >
      {topic.data && <Section section={section} topic={topic.data} />}
    </RecordWorkspace>
  );
};
