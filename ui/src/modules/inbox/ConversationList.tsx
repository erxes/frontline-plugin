import { contactQueries } from '@erxes/core-contract/client';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  cn,
  customerTitle,
  RelativeDateDisplay,
  ScrollArea,
  Skeleton,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useStatusNames } from './InboxFilter.tsx';
import { type Conversation, useMarkRead, useOpenConversation } from './queries.ts';
import { MemberLine } from '~/shared/MemberLine.tsx';

/** The customer's name, else their email or phone, else "Visitor". */
export const useCustomerName = (customerId: string) => {
  const { t } = useTranslation('frontline');
  const { data } = useQuery(contactQueries.customer(customerId));

  return (data && customerTitle(data)) || t('visitor', 'Visitor');
};

const Row = ({ conversation }: { conversation: Conversation }) => {
  const [openId, setOpenId] = useOpenConversation();
  const statuses = useStatusNames();
  const name = useCustomerName(conversation.customerId);
  const markRead = useMarkRead();
  const open = openId === conversation.id;

  // Opening a conversation reads it, as the old inbox did.
  const select = () => {
    void setOpenId(conversation.id);

    if (!conversation.isRead) markRead.mutate({ id: conversation.id });
  };

  return (
    <li>
      <button
        type="button"
        aria-current={open ? 'true' : undefined}
        onClick={select}
        className={cn(
          'flex w-full flex-col gap-1 border-b px-4 py-3 text-left hover:bg-accent',
          open && 'bg-accent',
        )}
      >
        <span className="flex items-center gap-2">
          {!conversation.isRead && (
            <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden />
          )}
          <span className={cn('flex-1 truncate text-sm', !conversation.isRead && 'font-semibold')}>
            {name}
          </span>
          <span className="text-xs text-muted-foreground">
            <RelativeDateDisplay.Value value={conversation.lastMessageAt.toISOString()} />
          </span>
        </span>
        <span className="truncate text-sm text-muted-foreground">{conversation.content}</span>
        <span className="flex items-center gap-2">
          <Badge variant={conversation.status === 'new' ? 'info' : 'secondary'}>
            {statuses[conversation.status]}
          </Badge>
          {conversation.assigneeId && <MemberLine id={conversation.assigneeId} size="sm" />}
        </span>
      </button>
    </li>
  );
};

/** The conversations on the left of the inbox, the open one marked; the older ones load on demand. */
export const ConversationList = ({
  conversations,
  isPending,
  hasNextPage,
  fetchNextPage,
}: {
  conversations: Conversation[];
  isPending: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <ScrollArea className="h-full">
      {isPending ? (
        <div className="flex flex-col gap-2 p-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : (
        <ul aria-label={t('conversations', 'Conversations')}>
          {conversations.map((conversation) => (
            <Row key={conversation.id} conversation={conversation} />
          ))}
        </ul>
      )}
      {hasNextPage && (
        <div className="p-3">
          <Button variant="ghost" className="w-full" onClick={fetchNextPage}>
            {t('load-more', 'Load more')}
          </Button>
        </div>
      )}
    </ScrollArea>
  );
};
