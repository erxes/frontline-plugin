import { IconRefresh } from '@tabler/icons-react';
import {
  Button,
  Checkbox,
  cn,
  IconTip,
  RecordList,
  RelativeDateDisplay,
  ScrollArea,
  Skeleton,
  usePageHotkey,
} from 'erxes-ui';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PersonAvatar, useCustomer } from '~/shared/Person.tsx';
import { KindIcon } from './InboxFilter.tsx';
import {
  type Conversation,
  useMarkRead,
  useOpenConversation,
  usePrefetchConversation,
} from './queries.ts';

/** Opens a conversation and reads it, as the old inbox did. */
export const useSelectConversation = () => {
  const [, setOpenId] = useOpenConversation();
  const markRead = useMarkRead();

  return (conversation: Conversation) => {
    void setOpenId(conversation.id);

    if (!conversation.isRead) markRead.mutate({ id: conversation.id });
  };
};

/** The list's row buttons carry the conversation's id, so the keys can move the focus between them. */
const ROW = 'data-conversation-id';

/**
 * The customer's avatar, and in its place on hover or focus, or once any row is picked, a
 * checkbox for the bar's bulk actions.
 */
const Pick = ({
  conversationId,
  name,
  avatarUrl,
}: {
  conversationId: string;
  name: string;
  avatarUrl?: string | null;
}) => {
  const { t } = useTranslation('frontline');
  const selection = RecordList.useSelection();
  const picking = selection.ids.length > 0;

  return (
    <span className="relative grid size-8 shrink-0 place-items-center">
      <span className={picking ? 'opacity-0' : 'group-hover:opacity-0'}>
        <PersonAvatar name={name} src={avatarUrl} />
      </span>
      <Checkbox
        aria-label={t('select-name', 'Select {{name}}', { name })}
        checked={selection.has(conversationId)}
        onCheckedChange={() => selection.toggle(conversationId)}
        className={cn(
          'absolute',
          !picking && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      />
    </span>
  );
};

/**
 * One conversation as the old inbox showed it: the customer's avatar and name, bold while
 * unread, the integration's icon and the channel, the time, and the last message under them.
 * Resting the pointer on a row loads its messages, so it opens at once; the arrow keys move on.
 */
const Row = ({
  conversation,
  onKeyDown,
}: {
  conversation: Conversation;
  onKeyDown: (event: KeyboardEvent) => void;
}) => {
  const { t } = useTranslation('frontline');
  const [openId] = useOpenConversation();
  const { name, avatarUrl } = useCustomer(conversation.customerId);
  const select = useSelectConversation();
  const prefetch = usePrefetchConversation();
  const open = openId === conversation.id;
  const picked = RecordList.useSelection().has(conversation.id);
  const unread = !conversation.isRead;

  return (
    <li
      className={cn(
        'group relative flex items-center gap-3 border-b px-3 hover:bg-accent/60',
        (open || picked) && 'bg-accent hover:bg-accent',
        open && 'before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary',
      )}
    >
      <Pick conversationId={conversation.id} name={name} avatarUrl={avatarUrl} />
      <button
        type="button"
        {...{ [ROW]: conversation.id }}
        aria-current={open ? 'true' : undefined}
        onClick={() => select(conversation)}
        onPointerEnter={() => prefetch(conversation)}
        onFocus={() => prefetch(conversation)}
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-1 flex-col gap-1 py-2.5 text-left outline-none"
      >
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              'min-w-0 truncate text-sm',
              unread ? 'font-semibold text-foreground' : 'font-medium',
            )}
          >
            {name}
          </span>
          <KindIcon kind={conversation.kind} className="size-3.5 shrink-0" />
          <span className="sr-only">{conversation.integrationName}</span>
          {/* The channel keeps a few letters when a long name crowds the row. */}
          <span className="min-w-16 flex-1 truncate text-xs text-muted-foreground">
            {conversation.channelName}
          </span>
          <span
            className={cn(
              'shrink-0 text-xs',
              unread ? 'font-medium text-primary-text' : 'text-muted-foreground',
            )}
          >
            <RelativeDateDisplay.Value value={conversation.lastMessageAt.toISOString()} />
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-sm',
              unread ? 'text-foreground' : 'text-muted-foreground',
            )}
          >
            {conversation.content}
          </span>
          {unread && (
            <span className="size-2 shrink-0 rounded-full bg-primary">
              <span className="sr-only">{t('unread', 'Unread')}</span>
            </span>
          )}
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
      <span className="flex-1" />
      <IconTip label={label}>
        <Button variant="ghost" tone="muted" size="icon" aria-label={label} onClick={refresh}>
          <IconRefresh />
        </Button>
      </IconTip>
    </div>
  );
};

/** Placeholders shaped like rows while the first page loads. */
const RowSkeletons = () => (
  <ul aria-hidden>
    {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((key) => (
      <li key={key} className="flex gap-3 px-3 py-3">
        <Skeleton radius="circle" className="size-8 shrink-0" />
        <span className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3.5 w-full" />
        </span>
      </li>
    ))}
  </ul>
);

/**
 * Moves through the list: J or K anywhere on the page, or the arrow keys inside the list, open
 * the next or previous conversation and keep its row in view and focused.
 */
const useListKeys = (conversations: Conversation[]) => {
  const [openId] = useOpenConversation();
  const select = useSelectConversation();

  const move = (step: 1 | -1) => {
    const index = conversations.findIndex((conversation) => conversation.id === openId);
    const next = conversations[index === -1 ? 0 : index + step];

    if (!next) return;

    select(next);
    document.querySelector<HTMLElement>(`[${ROW}="${CSS.escape(next.id)}"]`)?.focus();
  };

  usePageHotkey('j', () => move(1));
  usePageHotkey('k', () => move(-1));

  return (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();
    move(event.key === 'ArrowDown' ? 1 : -1);
  };
};

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
  const onKeyDown = useListKeys(conversations);

  return (
    <div className="flex h-full flex-col">
      <Toolbar conversations={conversations} refresh={refresh} />
      <ScrollArea className="min-h-0 flex-1">
        {isPending ? (
          <RowSkeletons />
        ) : (
          // As wide as the inbox's column: erxes-ui's ScrollArea lets its content grow to the widest
          // row, which would push the time and the ends of the previews out of sight.
          <ul aria-label={t('conversations', 'Conversations')} className="flex w-full flex-col">
            {conversations.map((conversation) => (
              <Row key={conversation.id} conversation={conversation} onKeyDown={onKeyDown} />
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
