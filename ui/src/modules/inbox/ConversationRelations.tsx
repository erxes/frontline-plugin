import { IconMessages } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  cn,
  Empty,
  RelativeDateDisplay,
  Spinner,
  type TRecordContacts,
  useOpenRecord,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { CONVERSATION_TYPE } from '~/plugin.ts';
import { KindIcon } from '~/shared/kinds.tsx';

/** The member's conversations with these customers, resolved ones too, latest message first. */
const useCustomerConversations = ({ customerIds }: TRecordContacts) => {
  const filter = {
    match: 'all',
    rules: [
      { path: 'subject.status', op: 'in', value: ['new', 'open', 'resolved'] },
      { path: 'subject.customerId', op: 'in', value: customerIds },
    ],
  };

  return useQuery({
    ...orpc.conversations.list.queryOptions({
      input: { filter: JSON.stringify(filter), limit: 50 },
    }),
    enabled: customerIds.length > 0,
  });
};

/**
 * The Conversations tab on a customer's panel: the conversations of the member's channels with
 * them. One opens on top in core's side panel.
 */
export const ConversationRelations = (contacts: TRecordContacts) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();
  const conversations = useCustomerConversations(contacts);

  const statusName: Record<string, string> = {
    new: t('status-new', 'New'),
    open: t('status-open', 'Open'),
    resolved: t('status-resolved', 'Resolved'),
  };

  if (conversations.isLoading) return <Spinner area="lg" />;

  if (conversations.error)
    return <p className="m-3 text-xs text-destructive-text">{conversations.error.message}</p>;

  const rows = conversations.data?.conversations ?? [];

  if (rows.length === 0) {
    return (
      <Empty variant="outline" className="m-3">
        <Empty.Header>
          <Empty.Media>
            <IconMessages />
          </Empty.Media>
          <Empty.Title>{t('no-conversations-yet', 'No conversations yet')}</Empty.Title>
        </Empty.Header>
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-1 p-2">
      {rows.map((conversation) => (
        <li key={conversation.id}>
          <button
            type="button"
            className="flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-accent"
            onClick={() => open({ contentType: CONVERSATION_TYPE, contentId: conversation.id })}
          >
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <KindIcon
                kind={conversation.kind}
                thread={conversation.externalId}
                className="size-3.5 shrink-0"
              />
              <span
                className={cn(
                  'min-w-0 flex-1 truncate',
                  conversation.isRead ? 'text-muted-foreground' : 'font-medium',
                )}
              >
                {conversation.content || conversation.integrationName}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                <RelativeDateDisplay.Value value={conversation.lastMessageAt.toISOString()} />
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-2 pl-5.5 text-xs text-muted-foreground">
              <span className="min-w-0 flex-1 truncate">{conversation.channelName}</span>
              <span className="shrink-0">{statusName[conversation.status]}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
};
