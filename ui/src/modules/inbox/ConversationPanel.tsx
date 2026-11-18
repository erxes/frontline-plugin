import {
  IconArrowBackUp,
  IconCheck,
  IconCircleDot,
  IconCircles,
  IconDots,
  IconMessage,
  IconUser,
} from '@tabler/icons-react';
import { Button, PanelSection, Skeleton, type TRecordSlotProps } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { PLUGIN } from '~/plugin.ts';
import { useChannelNames } from '~/shared/ChannelSelect.tsx';
import { MemberChip, useCustomer } from '~/shared/Person.tsx';
import { InfoRow, PageLink, PanelSkeleton } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { Customer } from './CustomerSidebar.tsx';
import { KindIcon, useStatusNames } from './InboxFilter.tsx';
import { useConversation } from './queries.ts';
import { useSetStatus } from './changes.ts';

/** The panel header's title: the customer the conversation is with, and its provider. */
export const ConversationTitle = ({ contentId }: TRecordSlotProps) => {
  const conversation = useConversation(contentId);
  const { name } = useCustomer(conversation.data?.customerId);

  if (conversation.isPending) return <Skeleton className="h-4 w-32" />;

  return (
    <span className="flex min-w-0 items-center gap-2">
      {conversation.data && <KindIcon kind={conversation.data.kind} className="size-4" />}
      <span className="truncate">{conversation.error?.message ?? name}</span>
    </span>
  );
};

/** The header's menu: resolve the conversation, or open it again. */
export const ConversationActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const conversation = useConversation(contentId).data;
  const setStatus = useSetStatus();

  if (!conversation) return null;

  const resolved = conversation.status === 'resolved';

  return (
    <ActionsMenu
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('conversation-menu', 'Conversation actions')}
        >
          <IconDots />
        </Button>
      }
      actions={[
        {
          value: 'status',
          icon: resolved ? <IconArrowBackUp /> : <IconCheck />,
          label: resolved ? t('reopen', 'Reopen') : t('resolve', 'Resolve'),
          onSelect: () =>
            setStatus.mutate({ ids: [conversation.id], status: resolved ? 'open' : 'resolved' }),
        },
      ]}
    />
  );
};

/** The Detail tab: the customer, the conversation's channel, status and assignee, and the inbox link. */
export const ConversationDetail = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const { data: conversation, error } = useConversation(contentId);
  const channels = useChannelNames();
  const statuses = useStatusNames();

  if (error) return <p className="p-4 text-sm text-destructive-text">{error.message}</p>;

  if (!conversation) return <PanelSkeleton rows={5} />;

  return (
    <>
      <Customer conversation={conversation} />
      <PanelSection title={t('conversation', 'Conversation')} icon={IconMessage}>
        <InfoRow icon={IconCircles} label={t('channel', 'Channel')}>
          {channels.get(conversation.channelId)} · {conversation.integrationName}
        </InfoRow>
        <InfoRow icon={IconCircleDot} label={t('status', 'Status')}>
          {statuses[conversation.status]}
        </InfoRow>
        {conversation.assigneeId && (
          <InfoRow icon={IconUser} label={t('assignee', 'Assignee')}>
            <MemberChip id={conversation.assigneeId} />
          </InfoRow>
        )}
        <PageLink
          to={`/${PLUGIN}/inbox?conversationId=${encodeURIComponent(conversation.id)}`}
          label={t('open-in-inbox', 'Open in the inbox')}
          count={conversation.messageCount}
        />
      </PanelSection>
    </>
  );
};
