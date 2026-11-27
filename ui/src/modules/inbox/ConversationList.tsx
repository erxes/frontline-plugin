import { IconArrowUp, IconRefresh } from '@tabler/icons-react';
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
import {
  type KeyboardEvent,
  type RefObject,
  startTransition,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { type CustomContainerComponentProps, Virtualizer, type VirtualizerHandle } from 'virtua';
import { useMinute } from '~/shared/hooks.ts';
import { LoadPage } from '~/shared/List.tsx';
import type { Paging } from '~/shared/paging.ts';
import { usePrefetch } from '~/shared/prefetch.ts';
import { ConversationRow, ROW, type RowHandlers } from './ConversationRow.tsx';
import { type Conversation, prefetchConversation, useOpenConversation } from './queries.ts';

/**
 * Opens a conversation as a transition: the open one stays in the pane until the next one's
 * messages are in, instead of a skeleton between them.
 */
const useSelectConversation = () => {
  const [, setOpenId] = useOpenConversation();

  return (conversation: Conversation) => startTransition(() => void setOpenId(conversation.id));
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
    // Its checkbox sits over the rows' avatars: their wrapper's and their own inset.
    <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4.5">
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
export const RowSkeletons = () => (
  <ul aria-hidden>
    {['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((key) => (
      <li key={key} className="flex gap-3 px-4.5 py-3">
        <Skeleton radius="circle" className="size-8 shrink-0" />
        <span className="flex flex-1 flex-col gap-2 pt-0.5">
          <Skeleton className="h-3.5 w-1/2" />
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3 w-1/3" />
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

/** How far down the list scrolls before it offers the way back up. */
const FAR = 600;

/**
 * Back to the newest conversations, once the list is scrolled far or its newest pages dropped
 * off: it scrolls to the top, and when those pages are gone loads the first page again at once
 * instead of paging back up through each.
 */
const BackToTop = ({
  viewport,
  paging,
  rewind,
}: {
  viewport: RefObject<HTMLDivElement | null>;
  paging: Paging;
  rewind: () => unknown;
}) => {
  const { t } = useTranslation('frontline');
  const [far, setFar] = useState(false);

  useEffect(() => {
    const node = viewport.current;

    if (!node) return;

    const onScroll = () => setFar(node.scrollTop > FAR);

    node.addEventListener('scroll', onScroll, { passive: true });

    return () => node.removeEventListener('scroll', onScroll);
  }, [viewport]);

  if (!far && !paging.hasPreviousPage) return null;

  const label = t('back-to-top', 'Back to top');

  return (
    <div className="absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
      <Button
        size="sm"
        onClick={() => {
          viewport.current?.scrollTo({ top: 0 });

          if (paging.hasPreviousPage) void rewind();
        }}
      >
        <IconArrowUp />
        {label}
      </Button>
    </div>
  );
};

/** The list the window renders the rows into, named for screen readers. */
const RowList = ({ style, children, ref }: CustomContainerComponentProps) => {
  const { t } = useTranslation('frontline');

  return (
    // As wide as the inbox's column, however it is dragged: erxes-ui's ScrollArea lets its
    // content grow to the widest row, which would push the time and the ends of the previews out
    // of sight, so the rows' text takes no part in measuring it.
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

/**
 * The conversations on the left of the inbox under their toolbar, the open one marked; the older
 * ones load as the list scrolls near its end, or from the button under it, and Back to top returns
 * to the newest. Only the rows in view and a few around them render, and they read what is
 * open and picked from here, once, instead of each subscribing for itself.
 */
export const ConversationList = ({
  conversations,
  customers,
  paging,
  refresh,
  rewind,
}: {
  conversations: Conversation[];
  customers: ReadonlyMap<string, CustomerContact>;
  paging: Paging;
  refresh: () => void;
  rewind: () => unknown;
}) => {
  const viewport = useRef<HTMLDivElement>(null);
  const rows = useRef<VirtualizerHandle>(null);
  const [openId] = useOpenConversation();

  const handlers: RowHandlers = {
    openId,
    now: useMinute(),
    selection: RecordList.useSelection(),
    select: useSelectConversation(),
    prefetch: usePrefetch(prefetchConversation),
    onKeyDown: useListKeys(conversations, (index) => rows.current?.scrollToIndex(index)),
  };

  return (
    <div className="flex h-full flex-col">
      <Toolbar conversations={conversations} refresh={refresh} />
      <ScrollArea.Root className="relative min-h-0 flex-1">
        <ScrollArea.Viewport ref={viewport}>
          <LoadPage paging={paging} newer />
          <div aria-hidden className="h-1" />
          <Virtualizer ref={rows} scrollRef={viewport} data={conversations} as={RowList} item="li">
            {(conversation) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                customer={customers.get(conversation.customerId)}
                handlers={handlers}
              />
            )}
          </Virtualizer>
          <LoadPage paging={paging} />
        </ScrollArea.Viewport>
        <ScrollArea.Bar />
        <BackToTop viewport={viewport} paging={paging} rewind={rewind} />
      </ScrollArea.Root>
    </div>
  );
};
