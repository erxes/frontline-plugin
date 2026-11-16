import { contactQueries } from '@erxes/core-contract/client';
import { IconRefresh } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Avatar,
  Button,
  Checkbox,
  cn,
  customerTitle,
  IconTip,
  RecordList,
  RelativeDateDisplay,
  ScrollArea,
  Skeleton,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { KindIcon } from './InboxFilter.tsx';
import { type Conversation, useMarkRead, useOpenConversation } from './queries.ts';

/** The customer's name, else their email or phone, else "Visitor". */
export const useCustomerName = (customerId: string) => {
  const { t } = useTranslation('frontline');
  const { data } = useQuery(contactQueries.customer(customerId));

  return (data && customerTitle(data)) || t('visitor', 'Visitor');
};

/** Opens a conversation and reads it, as the old inbox did. */
export const useSelectConversation = () => {
  const [, setOpenId] = useOpenConversation();
  const markRead = useMarkRead();

  return (conversation: Conversation) => {
    void setOpenId(conversation.id);

    if (!conversation.isRead) markRead.mutate({ id: conversation.id });
  };
};

/**
 * One conversation as the old inbox showed it: the customer's avatar, their name, bold while
 * unread, the integration it came through, and the last message. A checkbox takes the avatar's
 * place on hover or focus, or once any row is picked, for the bar's bulk actions.
 */
const Row = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const [openId] = useOpenConversation();
  const name = useCustomerName(conversation.customerId);
  const select = useSelectConversation();
  const selection = RecordList.useSelection();
  const open = openId === conversation.id;
  const picked = selection.has(conversation.id);
  const picking = selection.ids.length > 0;

  return (
    <li
      className={cn(
        'group relative flex gap-3 border-b px-3 hover:bg-accent/60',
        (open || picked) && 'bg-accent',
        open && 'before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary',
      )}
    >
      <span className="relative mt-3 grid size-8 shrink-0 place-items-center">
        <Avatar
          size="lg"
          className={cn(
            picking ? 'opacity-0' : 'group-focus-within:opacity-0 group-hover:opacity-0',
          )}
        >
          <Avatar.Fallback>{name.charAt(0).toUpperCase()}</Avatar.Fallback>
        </Avatar>
        <Checkbox
          aria-label={t('select-name', 'Select {{name}}', { name })}
          checked={picked}
          onCheckedChange={() => selection.toggle(conversation.id)}
          className={cn(
            'absolute',
            !picking && 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100',
          )}
        />
      </span>
      <button
        type="button"
        aria-current={open ? 'true' : undefined}
        onClick={() => select(conversation)}
        className="flex min-w-0 flex-1 flex-col gap-0.5 py-2.5 text-left outline-none"
      >
        <span className="flex items-center gap-2">
          {!conversation.isRead && (
            <span className="size-2 shrink-0 rounded-full bg-primary">
              <span className="sr-only">{t('unread', 'Unread')}</span>
            </span>
          )}
          <span
            className={cn(
              'flex-1 truncate text-sm',
              conversation.isRead ? 'font-medium' : 'font-semibold',
            )}
          >
            {name}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            <RelativeDateDisplay.Value value={conversation.lastMessageAt.toISOString()} />
          </span>
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <KindIcon kind={conversation.kind} className="size-3.5 shrink-0" />
          <span className="truncate">{conversation.integrationName}</span>
        </span>
        <span
          className={cn(
            'truncate text-sm',
            conversation.isRead ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {conversation.content}
        </span>
      </button>
    </li>
  );
};

/**
 * Above the list: pick every shown conversation, or refresh it. How many match shows in the
 * filter bar, as core's lists have it.
 */
const Toolbar = ({
  conversations,
  refresh,
}: {
  conversations: Conversation[];
  refresh: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const selection = RecordList.useSelection();
  const ids = conversations.map((conversation) => conversation.id);
  const all = ids.length > 0 && ids.every((id) => selection.has(id));
  const label = t('refresh', 'Refresh');

  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1">
      <span className="grid size-8 place-items-center">
        <Checkbox
          aria-label={t('select-all-conversations', 'Select all conversations')}
          checked={all}
          indeterminate={!all && ids.some((id) => selection.has(id))}
          onCheckedChange={() => selection.toggleAll(ids)}
        />
      </span>
      <IconTip label={label}>
        <Button variant="ghost" size="icon" aria-label={label} onClick={refresh}>
          <IconRefresh />
        </Button>
      </IconTip>
    </div>
  );
};

/** Placeholders shaped like rows while the first page loads. */
const RowSkeletons = () => (
  <ul aria-hidden>
    {['a', 'b', 'c', 'd', 'e', 'f'].map((key) => (
      <li key={key} className="flex gap-3 border-b px-3 py-3">
        <Skeleton className="size-8 shrink-0" />
        <span className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-3.5 w-full" />
        </span>
      </li>
    ))}
  </ul>
);

/**
 * The conversations on the left of the inbox under their toolbar, the open one marked; the older
 * ones load on demand.
 */
export const ConversationList = ({
  conversations,
  isPending,
  hasNextPage,
  fetchNextPage,
  refresh,
}: {
  conversations: Conversation[];
  isPending: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  refresh: () => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <div className="flex h-full flex-col">
      <Toolbar conversations={conversations} refresh={refresh} />
      <ScrollArea className="min-h-0 flex-1">
        {isPending ? (
          <RowSkeletons />
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
    </div>
  );
};
