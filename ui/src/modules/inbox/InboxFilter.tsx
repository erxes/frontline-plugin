import {
  IconAt,
  IconCalendarCheck,
  IconCalendarPlus,
  IconCalendarUp,
  IconCircles,
  IconEye,
  IconMessageQuestion,
  IconPlug,
  IconProgressCheck,
  IconTag,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { TListFilterField } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useKindNames } from '~/shared/kinds.tsx';
import { channelsQuery } from '~/shared/reference.ts';
import { type Conversation, useIntegrations } from './queries.ts';

/** What each status reads as. */
export const useStatusNames = (): Record<Conversation['status'], string> => {
  const { t } = useTranslation('frontline');

  return {
    new: t('status-new', 'New'),
    open: t('status-open', 'Open'),
    resolved: t('status-resolved', 'Resolved'),
  };
};

/** The dates a conversation carries. */
const useDateFields = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');

  return [
    {
      path: 'subject.createdAt',
      label: t('created-at', 'Created at'),
      type: 'date',
      icon: IconCalendarPlus,
    },
    {
      path: 'subject.lastMessageAt',
      label: t('last-message-at', 'Last message'),
      type: 'date',
      icon: IconCalendarUp,
    },
    {
      path: 'subject.resolvedAt',
      label: t('resolved-at', 'Resolved at'),
      type: 'date',
      icon: IconCalendarCheck,
    },
  ];
};

/**
 * Every field the inbox narrows by, as the old inbox's filters had them: channel, integration,
 * status, assignee, participant, tags, unread and awaiting reply, and its dates. The API applies
 * them (`api/src/modules/inbox/conversations.ts`).
 */
export const useInboxFields = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');
  const channels = useQuery(channelsQuery).data?.channels ?? [];
  const integrations = useIntegrations().data ?? [];
  const statuses = useStatusNames();
  const kinds = useKindNames();

  return [
    {
      path: 'subject.status',
      label: t('status', 'Status'),
      type: 'select',
      icon: IconProgressCheck,
      options: Object.entries(statuses).map(([value, label]) => ({ value, label })),
    },
    {
      path: 'subject.channelId',
      label: t('channel', 'Channel'),
      type: 'select',
      icon: IconCircles,
      options: channels.map((channel) => ({ value: channel.id, label: channel.name })),
    },
    {
      path: 'subject.integrationId',
      label: t('integration', 'Integration'),
      type: 'select',
      icon: IconPlug,
      options: integrations.map((integration) => ({
        value: integration.id,
        label: integration.name,
      })),
    },
    {
      path: 'subject.kind',
      label: t('integration-kind', 'Integration kind'),
      type: 'select',
      icon: IconPlug,
      options: [...new Set(integrations.map((integration) => integration.kind))].map((kind) => ({
        value: kind,
        label: kinds[kind] ?? kind,
      })),
    },
    {
      path: 'subject.assigneeId',
      label: t('assignee', 'Assignee'),
      type: 'member',
      icon: IconUser,
    },
    {
      path: 'subject.participantIds',
      label: t('participant', 'Participant'),
      type: 'member',
      icon: IconUsers,
    },
    {
      path: 'subject.mentionedUserIds',
      label: t('mentioned', 'Mentioned'),
      type: 'member',
      icon: IconAt,
    },
    { path: 'subject.tagIds', label: t('tags', 'Tags'), type: 'tags', icon: IconTag },
    { path: 'subject.isRead', label: t('read', 'Read'), type: 'boolean', icon: IconEye },
    {
      path: 'subject.customerRespondedLast',
      label: t('awaiting-reply', 'Awaiting reply'),
      type: 'boolean',
      icon: IconMessageQuestion,
    },
    ...useDateFields(),
  ];
};
