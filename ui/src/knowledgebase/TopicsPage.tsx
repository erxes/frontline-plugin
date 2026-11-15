import { IconBook } from '@tabler/icons-react';
import { Empty, Skeleton } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router-dom';
import { CreateButton } from '../shared/List.tsx';
import { KB_PATH, useKbPanels, useTopics } from './useKnowledgeBase.ts';

/** The knowledge base's root: the first topic's articles, or how to start one. */
export const TopicsPage = () => {
  const { t } = useTranslation('frontline');
  const { data, isPending, error } = useTopics();
  const { topic } = useKbPanels();
  const [first] = data?.topics ?? [];

  if (isPending) return <Skeleton className="m-3 h-40" />;

  if (error) return <p className="m-3 text-sm text-destructive-text">{error.message}</p>;

  // While the topic panel is open the root waits: creating opens the new topic, closing the first.
  if (first)
    return topic.value ? null : <Navigate to={`${KB_PATH}/${first.id}/articles`} replace />;

  return (
    <Empty variant="outline" className="m-3">
      <Empty.Header>
        <Empty.Media>
          <IconBook />
        </Empty.Media>
        <Empty.Title>{t('kb-no-topics-yet', 'There are no topics yet')}</Empty.Title>
        <Empty.Description>
          {t('kb-no-topics-description', 'Create your first topic and start your knowledge base.')}
        </Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <CreateButton
          allowed={data.can.topics}
          label={t('kb-create-topic', 'Create Topic')}
          onClick={() => topic.open('new')}
        />
      </Empty.Content>
    </Empty>
  );
};
