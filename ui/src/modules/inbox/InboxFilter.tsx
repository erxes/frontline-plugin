import {
  IconAt,
  IconBrandDiscord,
  IconBrandInstagram,
  IconBrandMessenger,
  IconBrandTelegram,
  IconCalendarCheck,
  IconCalendarPlus,
  IconCalendarUp,
  IconCircles,
  IconEye,
  IconMail,
  IconMessageCircle,
  IconMessageQuestion,
  IconPhone,
  IconPlug,
  IconProgressCheck,
  IconTag,
  IconUser,
  IconUsers,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { cn, type TListFilterField } from 'erxes-ui';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
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

/** What each integration kind reads as; a kind the UI doesn't know shows its name. */
export const useKindNames = (): Record<string, string> => {
  const { t } = useTranslation('frontline');

  return {
    messenger: t('kind-messenger', 'Messenger'),
    facebook: t('kind-facebook', 'Facebook Messenger'),
    instagram: t('kind-instagram', 'Instagram'),
    telegram: t('kind-telegram', 'Telegram'),
    discord: t('kind-discord', 'Discord'),
    mail: t('kind-mail', 'Email'),
    call: t('kind-call', 'Phone'),
    callpro: t('kind-callpro', 'CallPro'),
  };
};

/**
 * Each kind's icon, tinted as near its brand as the theme's tokens get, so a row says where a
 * conversation came from at a glance, as the old inbox's coloured icons did.
 */
const KIND_ICONS: Record<string, { icon: ComponentType<{ className?: string }>; tint: string }> = {
  messenger: { icon: IconMessageCircle, tint: 'text-primary-text' },
  facebook: { icon: IconBrandMessenger, tint: 'text-info-text' },
  instagram: { icon: IconBrandInstagram, tint: 'text-destructive-text' },
  telegram: { icon: IconBrandTelegram, tint: 'text-info-text' },
  discord: { icon: IconBrandDiscord, tint: 'text-primary-text' },
  mail: { icon: IconMail, tint: 'text-warning-text' },
  call: { icon: IconPhone, tint: 'text-success-text' },
  callpro: { icon: IconPhone, tint: 'text-success-text' },
};

/** The icon of the integration kind a conversation came through, a plug for one the UI doesn't know. */
export const KindIcon = ({ kind, className }: { kind: string; className?: string }) => {
  const { icon: Icon, tint } = KIND_ICONS[kind] ?? {
    icon: IconPlug,
    tint: 'text-muted-foreground',
  };

  return <Icon className={cn(tint, className)} aria-hidden />;
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
  const channels = useQuery(orpc.channels.list.queryOptions({ input: {} })).data?.channels ?? [];
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
