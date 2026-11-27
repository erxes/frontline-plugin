import {
  IconArrowBackUp,
  IconCheck,
  IconCircleDot,
  IconCircles,
  IconDots,
  IconMail,
  IconMessage,
  IconPhone,
  IconUser,
} from '@tabler/icons-react';
import { contactQueries } from '@erxes/core-contract/client';
import { useQuery } from '@tanstack/react-query';
import { Button, PanelSection, Skeleton, type TRecordSlotProps } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { conversationPath } from '~/plugin.ts';
import { ChannelLabel } from '~/shared/ChannelSelect.tsx';
import { ContactChip, MemberChip, useCustomer } from '~/shared/Person.tsx';
import { InfoRow, PageLink, PanelSkeleton } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { KindIcon } from '~/shared/kinds.tsx';
import { ConversationCallSection } from './ConversationCall.tsx';
import { VisitorPresence } from './ConversationPresence.tsx';
import { useStatusNames } from './InboxFilter.tsx';
import { type Conversation, useConversation, useConversationSignal } from './queries.ts';
import { useSetStatus } from './changes.ts';

/**
 * Who the customer is: their chip, which opens them in core's side panel, how to reach them and,
 * for a messenger visitor, whether they are online.
 */
const Customer = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const { customerId } = conversation;
  const customer = useQuery(contactQueries.customer(customerId)).data;

  return (
    <PanelSection title={t('customer', 'Customer')} icon={IconUser}>
      <ContactChip contentId={customerId} placeholder={t('visitor', 'Visitor')} />
      <VisitorPresence conversation={conversation} className="flex-wrap px-2" />
      {customer?.primaryEmail && (
        <InfoRow icon={IconMail} label={t('email', 'Email')}>
          <span className="truncate">{customer.primaryEmail}</span>
        </InfoRow>
      )}
      {customer?.primaryPhone && (
        <InfoRow icon={IconPhone} label={t('phone', 'Phone')}>
          {customer.primaryPhone}
        </InfoRow>
      )}
    </PanelSection>
  );
};

/** The panel header's title: the customer the conversation is with, and its provider. */
export const ConversationTitle = ({ contentId }: TRecordSlotProps) => {
  const conversation = useConversation(contentId);
  const { name } = useCustomer(conversation.data?.customerId);

  if (conversation.isPending) return <Skeleton className="h-4 w-32" />;

  return (
    <span className="flex min-w-0 items-center gap-2">
      {conversation.data && (
        <KindIcon
          kind={conversation.data.kind}
          thread={conversation.data.externalId}
          className="size-4"
        />
      )}
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

/**
 * The Detail tab: the customer, the conversation's channel, status and assignee, the inbox link
 * and, for a call, the call with its recording to listen to.
 */
export const ConversationDetail = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const { data: conversation, error } = useConversation(contentId);

  useConversationSignal(contentId);
  const statuses = useStatusNames();

  if (error) return <p className="p-4 text-sm text-destructive-text">{error.message}</p>;

  if (!conversation) return <PanelSkeleton rows={5} />;

  return (
    <>
      <Customer conversation={conversation} />
      <PanelSection title={t('conversation', 'Conversation')} icon={IconMessage}>
        <InfoRow icon={IconCircles} label={t('channel', 'Channel')}>
          <ChannelLabel id={conversation.channelId} />
          <span className="truncate text-muted-foreground">· {conversation.integrationName}</span>
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
          to={conversationPath(conversation.id)}
          label={t('open-in-inbox', 'Open in the inbox')}
          count={conversation.messageCount}
        />
      </PanelSection>
      <ConversationCallSection conversation={conversation} />
    </>
  );
};
