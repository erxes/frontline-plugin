import { IconRefresh } from '@tabler/icons-react';
import {
  Button,
  Checkbox,
  type CustomerContact,
  IconTip,
  RecordList,
  ScrollArea,
  Skeleton,
  usePageHotkey,
} from 'erxes-ui';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type CustomContainerComponentProps, Virtualizer, type VirtualizerHandle } from 'virtua';
import { LoadPage } from '~/shared/List.tsx';
import type { Paging } from '~/shared/paging.ts';
import { ConversationRow, ROW, type RowHandlers } from './ConversationRow.tsx';
import { type Conversation, useOpenConversation, usePrefetchConversation } from './queries.ts';

/** Opens a conversation; the pane reads it once it shows. */
export const useSelectConversation = () => {
  const [, setOpenId] = useOpenConversation();

  return (conversation: Conversation) => void setOpenId(conversation.id);
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
const useListKeys = (conversations: Conversation[], reveal: (index: number) => void) => {
  const [openId] = useOpenConversation();
  const select = useSelectConversation();

  const move = (step: 1 | -1) => {
    const index = conversations.findIndex((conversation) => conversation.id === openId);
    const nextIndex = index === -1 ? 0 : index + step;
    const next = conversations[nextIndex];

    if (!next) return;

    select(next);
    reveal(nextIndex);
    // The row renders once the window has scrolled to it.
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[${ROW}="${CSS.escape(next.id)}"]`)?.focus(),
    );
  };

  usePageHotkey('j', () => move(1));
  usePageHotkey('k', () => move(-1));

  return (event: KeyboardEvent) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;

    event.preventDefault();
    move(event.key === 'ArrowDown' ? 1 : -1);
  };
};

/** The list the window renders the rows into, named for screen readers. */
const RowList = ({ style, children, ref }: CustomContainerComponentProps) => {
  const { t } = useTranslation('frontline');

  return (
    // As wide as the inbox's column, however it is dragged: erxes-ui's ScrollArea lets its
    // content grow to the widest row, which would push the time and the ends of the previews out
    // of sight, so the rows' text takes no part in measuring it. The same query box lets a row
    // drop its channel when the list is dragged narrow.
    <ul
      ref={ref}
      style={style}
      aria-label={t('conversations', 'Conversations')}
      className="@container w-full"
    >
      {children}
    </ul>
  );
};

/** How near its end a scroll loads the list's next page, in pixels. */
const NEXT_PX = 600;

/** The time, moved on each minute, for the rows' waiting clocks. */
const useMinute = () => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);

    return () => clearInterval(timer);
  }, []);

  return now;
};

/**
 * The conversations on the left of the inbox under their toolbar, the open one marked; the older
 * ones load as the list scrolls near its end, or from the button under it. Only the rows in view and a few around them render, and they read what is
 * open and picked from here, once, instead of each subscribing for itself.
 */
export const ConversationList = ({
  conversations,
  customers,
  paging,
  refresh,
}: {
  conversations: Conversation[];
  customers: ReadonlyMap<string, CustomerContact>;
  paging: Paging;
  refresh: () => void;
}) => {
  const viewport = useRef<HTMLDivElement>(null);
  const rows = useRef<VirtualizerHandle>(null);
  const [openId] = useOpenConversation();

  const handlers: RowHandlers = {
    openId,
    now: useMinute(),
    selection: RecordList.useSelection(),
    select: useSelectConversation(),
    prefetch: usePrefetchConversation(),
    onKeyDown: useListKeys(conversations, (index) => rows.current?.scrollToIndex(index)),
  };

  return (
    <div className="flex h-full flex-col">
      <Toolbar conversations={conversations} refresh={refresh} />
      <ScrollArea.Root className="min-h-0 flex-1">
        <ScrollArea.Viewport ref={viewport}>
          <LoadPage paging={paging} newer />
          {paging.isPending ? (
            <RowSkeletons />
          ) : (
            <Virtualizer
              ref={rows}
              scrollRef={viewport}
              data={conversations}
              as={RowList}
              item="li"
              onScroll={(offset) => {
                const handle = rows.current;

                // A page that failed loads again from its button, not on every scroll.
                if (!handle || !paging.hasNextPage) return;

                if (paging.isFetchingNextPage || paging.isFetchNextPageError) return;

                if (offset + handle.viewportSize > handle.scrollSize - NEXT_PX)
                  void paging.fetchNextPage();
              }}
            >
              {(conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  customer={customers.get(conversation.customerId)}
                  handlers={handlers}
                />
              )}
            </Virtualizer>
          )}
          <LoadPage paging={paging} />
        </ScrollArea.Viewport>
        <ScrollArea.Bar />
      </ScrollArea.Root>
    </div>
  );
};
