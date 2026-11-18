import {
  IconAlignLeft,
  IconArticle,
  IconCalendarPlus,
  IconCode,
  IconDots,
  IconFolders,
  IconLetterCase,
  IconSettings,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  PanelField,
  PanelSection,
  Skeleton,
  TextField,
  type TRecordSlotProps,
  useFormat,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { InfoRow, PanelSkeleton, PageLink, ReadOnly } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { useDeleteTopics } from './useKbDeletes.ts';
import { type Topic, topicPath, useKbAccess, useKbChange, useTopic } from './useKnowledgeBase.ts';
import { MemberChip } from '~/shared/Person.tsx';

/** The panel header's title: the topic's title. */
export const TopicTitle = ({ contentId }: TRecordSlotProps) => {
  const topic = useTopic(contentId);

  if (topic.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{topic.data?.title ?? topic.error?.message}</span>;
};

/** The header's menu, for topic managers: delete it with its categories and articles. */
export const TopicActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();
  const { deleteTopics } = useDeleteTopics();

  if (!can.topics) return null;

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('kb-topic-menu', 'Topic actions')}>
          <IconDots />
        </Button>
      }
      actions={[
        {
          value: 'delete',
          icon: <IconTrash />,
          label: t('delete', 'Delete'),
          onSelect: () => void deleteTopics([contentId]),
        },
      ]}
    />
  );
};

/** The topic's title, description and code, edited in place by topic managers. */
const TopicFields = ({ topic }: { topic: Topic }) => {
  const { t } = useTranslation('frontline');
  const can = useKbAccess();
  const format = useFormat();
  const update = useMutation(orpc.knowledgebase.topics.update.mutationOptions(useKbChange()));

  const edit = (fields: { title?: string; description?: string; code?: string }) =>
    update.mutate({ id: topic.id, ...fields });

  const scope = `frontline-kb-topic.${topic.id}`;

  return (
    <PanelSection title={t('kb-topic', 'Topic')}>
      <ReadOnly when={!can.topics}>
        <PanelField icon={IconLetterCase} label={t('title', 'Title')}>
          <TextField
            scope={`${scope}.title`}
            value={topic.title}
            placeholder={t('title', 'Title')}
            onSave={(title) => {
              const next = title.trim();

              if (next && next !== topic.title) edit({ title: next });
            }}
          />
        </PanelField>
        <PanelField icon={IconAlignLeft} label={t('description', 'Description')}>
          <TextField
            scope={`${scope}.description`}
            value={topic.description ?? ''}
            placeholder={t('description', 'Description')}
            onSave={(description) => edit({ description })}
          />
        </PanelField>
        <PanelField icon={IconCode} label={t('kb-code', 'Code')}>
          <TextField
            scope={`${scope}.code`}
            value={topic.code ?? ''}
            placeholder={t('kb-code', 'Code')}
            onSave={(code) => edit({ code })}
          />
        </PanelField>
      </ReadOnly>
      <InfoRow icon={IconUser} label={t('created-by', 'Created by')}>
        <MemberChip id={topic.createdBy} />
      </InfoRow>
      <InfoRow icon={IconCalendarPlus} label={t('created-at', 'Created at')}>
        {format.dateTime(topic.createdAt)}
      </InfoRow>
    </PanelSection>
  );
};

/** The topic's articles, categories and help center settings, each a page of its own. */
const TopicPages = ({ topic }: { topic: Topic }) => {
  const { t } = useTranslation('frontline');

  return (
    <PanelSection title={t('kb-topic-pages', 'Topic pages')}>
      <PanelField icon={IconArticle} label={t('articles', 'Articles')} cell={false}>
        <PageLink
          to={topicPath(topic.id, 'articles')}
          label={t('kb-manage-articles', 'Manage articles')}
          count={topic.articleCount}
        />
      </PanelField>
      <PanelField icon={IconFolders} label={t('kb-categories', 'Categories')} cell={false}>
        <PageLink
          to={topicPath(topic.id, 'categories')}
          label={t('kb-manage-categories', 'Manage categories')}
          count={topic.categoryCount}
        />
      </PanelField>
      <PanelField icon={IconSettings} label={t('settings', 'Settings')} cell={false}>
        <PageLink
          to={topicPath(topic.id, 'kbsettings')}
          label={t('kb-help-center-settings', 'Help center settings')}
          count=""
        />
      </PanelField>
    </PanelSection>
  );
};

/** The Detail tab: the topic's fields, then links to its articles, categories and settings. */
export const TopicDetail = ({ contentId }: TRecordSlotProps) => {
  const topic = useTopic(contentId);

  if (topic.isPending) return <PanelSkeleton />;

  if (topic.isError)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {topic.error.message}
      </p>
    );

  return (
    <>
      <TopicFields topic={topic.data} />
      <TopicPages topic={topic.data} />
    </>
  );
};
