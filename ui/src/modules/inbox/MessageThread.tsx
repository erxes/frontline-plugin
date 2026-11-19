import { IconArrowDown } from '@tabler/icons-react';
import { Button, cn, ScrollArea, Skeleton, Spinner, toast, toIsoDay, useFormat } from 'erxes-ui';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type CustomContainerComponentProps, Virtualizer, type VirtualizerHandle } from 'virtua';
import { type Conversation, type Message, threadOf, useMessages } from './queries.ts';
import { LoadPage } from '~/shared/List.tsx';
import { useCustomer } from '~/shared/Person.tsx';
import { Bubble, continues } from './MessageBubble.tsx';
import { PinnedBar } from './PinnedBar.tsx';

/** The day a run of messages was sent: Today, Yesterday or its date. */
const DayDivider = ({ date }: { date: Date }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const day = toIsoDay(date);
  // The day the thread opened, read once, so the label holds still while it stays open.
  const [today] = useState(() => new Date());
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

  const label =
    day === toIsoDay(today)
      ? t('today', 'Today')
      : day === toIsoDay(yesterday)
        ? t('yesterday', 'Yesterday')
        : format.date(date);

  return (
    <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
      <hr className="flex-1" />
      {label}
      <hr className="flex-1" />
    </div>
  );
};

/** Placeholders shaped like a short exchange while the messages load. */
const ThreadSkeleton = () => (
  <div aria-hidden className="flex flex-col gap-4 p-4">
    <Skeleton className="h-12 w-2/5" />
    <Skeleton className="h-16 w-1/2 self-end" />
    <Skeleton className="h-10 w-1/3" />
  </div>
);

/** The thread's list, named for screen readers, as wide as a message may be. */
const MessageList = ({ style, children, ref }: CustomContainerComponentProps) => {
  const { t } = useTranslation('frontline');

  return (
    <ol ref={ref} style={style} aria-label={t('messages', 'Messages')} className="w-full">
      {children}
    </ol>
  );
};

/**
 * Whether the messages last changed by gaining earlier ones above those shown, the one change
 * after which the window keeps its place from the end rather than the start.
 */
const usePrepended = (messages: Message[]) => {
  const ends = { first: messages[0]?.id, last: messages.at(-1)?.id };
  const [seen, setSeen] = useState({ ...ends, prepended: false });

  if (seen.first !== ends.first || seen.last !== ends.last) {
    setSeen({
      ...ends,
      prepended:
        seen.last === ends.last && messages.findIndex((message) => message.id === seen.first) > 0,
    });
  }

  return seen.prepended;
};

/** How near the end the reader has to be for a new message to scroll the thread to it. */
const FOLLOW_PX = 120;

/** How near the top the reader has to scroll for the earlier messages to load. */
const EARLIER_PX = 400;

/** How long virtua keeps scrolling back to its target, 150 ms, with room for a late timer. */
const HOLD_MS = 200;

/**
 * Below the thread while the reader is up in its history: how many messages came since, or a way
 * back to the newest. It fades in, so it doesn't jump at a reader who scrolled up a line.
 */
const LatestButton = ({
  shown,
  unseen,
  onClick,
}: {
  shown: boolean;
  unseen: number;
  onClick: () => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    // As wide as the button, so the thread around it still takes clicks; hidden, it takes none.
    <div
      inert={!shown}
      className={cn(
        'absolute inset-x-0 bottom-3 mx-auto w-fit transition-opacity',
        !shown && 'opacity-0',
      )}
    >
      <Button variant="outline" size="sm" onClick={onClick}>
        <IconArrowDown />
        {unseen > 0
          ? t('new-messages', '{{count}} new messages', {
              count: unseen,
              defaultValue_one: '{{count}} new message',
            })
          : t('latest-messages', 'Latest messages')}
      </Button>
    </div>
  );
};

/**
 * The thread's top edge: a spinner while earlier messages load, else a button that loads them,
 * for a thread too short to scroll or a page that failed to load.
 */
const EarlierMessages = ({ thread }: { thread: ReturnType<typeof useMessages> }) => {
  const { t } = useTranslation('frontline');

  return (
    <div className="flex h-12 items-center justify-center">
      {thread.isFetchingNextPage ? (
        <Spinner aria-label={t('earlier-messages', 'Earlier messages')} />
      ) : (
        thread.hasNextPage && (
          <Button variant="ghost" size="sm" onClick={() => void thread.fetchNextPage()}>
            {thread.isFetchNextPageError
              ? t('earlier-messages-failed', 'Earlier messages did not load. Try again')
              : t('earlier-messages', 'Earlier messages')}
          </Button>
        )
      )}
    </div>
  );
};

/**
 * Where the reader is in the thread. A new message scrolls into view while they sit at the end,
 * or when the member sent it; a reader up in the history stays put, and `unseen` counts what came
 * below. Earlier messages load as the reader nears the top, and `jumpedTo`, a message's index,
 * scrolls to it.
 */
const useReader = (thread: ReturnType<typeof useMessages>, jumpedTo: number) => {
  const { messages } = thread;
  const rows = useRef<VirtualizerHandle>(null);
  // While the newest messages are dropped for older ones, the last shown is no new arrival.
  const last = thread.hasPreviousPage ? undefined : messages.at(-1);
  const lastId = last?.id;
  // The member's own message, from the composer, always scrolls into view.
  const sentByMe = Boolean(last && !last.customerId && last.canEdit);
  const [atEnd, setAtEnd] = useState(true);
  const following = useRef(true);
  /**
   * What virtua's last scroll call holds in place, the end of the thread or the row the reader
   * scrolled to, and when it last scrolled there or saw a row resize: it scrolls there again on
   * every row it measures, until HOLD_MS pass with neither.
   */
  const hold = useRef<{ on: 'end' | 'reader'; at: number }>(undefined);

  const held = () => {
    const { current } = hold;

    return current && performance.now() - current.at < HOLD_MS ? current.on : undefined;
  };

  // The newest message the reader has had in view; what came after it counts as new.
  const [seenId, setSeenId] = useState(lastId);

  if (atEnd && seenId !== lastId) setSeenId(lastId);

  const seenAt = messages.findIndex((message) => message.id === seenId);
  const unseen = atEnd || seenAt === -1 ? 0 : messages.length - 1 - seenAt;

  // virtua clamps the index to the last message.
  const toEnd = () => {
    hold.current = { on: 'end', at: performance.now() };
    rows.current?.scrollToIndex(Infinity, { align: 'end' });
  };

  useEffect(() => {
    if (!lastId || !(following.current || sentByMe)) return;

    hold.current = { on: 'end', at: performance.now() };
    rows.current?.scrollToIndex(Infinity, { align: 'end' });
  }, [lastId, sentByMe]);

  // A message jumped to centres once its page rendered, and the smooth scroll holds no row.
  useEffect(() => {
    if (jumpedTo === -1) return;

    hold.current = undefined;
    rows.current?.scrollToIndex(jumpedTo, { align: 'center', smooth: true });
  }, [jumpedTo]);

  const onScroll = (offset: number) => {
    const handle = rows.current;

    if (!handle) return;

    const end = handle.scrollSize - offset - handle.viewportSize < FOLLOW_PX;

    // A reader who scrolls while virtua holds the end moves its hold to the row they reached, so
    // it no longer pulls them back; the virtualizer starts at the scroller's top, so offsets agree.
    const on = held();

    if (on && !end) {
      const row = handle.findItemIndex(offset);

      hold.current = { on: 'reader', at: performance.now() };
      handle.scrollToIndex(row, { offset: offset - handle.getItemOffset(row) });
    } else if (on === 'reader') toEnd();

    following.current = end;
    setAtEnd(end);

    if (offset < EARLIER_PX && thread.hasNextPage && !thread.isFetchingNextPage)
      void thread.fetchNextPage();
  };

  return {
    rows,
    onScroll,
    // A row's resize keeps virtua's hold going, though nothing scrolls.
    onResize: () => {
      if (hold.current) hold.current.at = performance.now();
    },
    atEnd,
    unseen,
    toEnd,
  };
};

/** How long a message the member jumped to stays marked, the smooth scroll to it included. */
const MARK_MS = 1500;

/**
 * Goes to a message, from the pinned bar: loads earlier pages until it is among them, or newer ones
 * when the reader went back so far that the newest were dropped, then centres it and marks it for
 * a moment. One no longer in the thread says so.
 */
const useJump = (thread: ReturnType<typeof useMessages>) => {
  const { t } = useTranslation('frontline');
  const [marked, setMarked] = useState<string>();
  // The page that holds it renders before the thread can scroll there.
  const index = marked ? thread.messages.findIndex((message) => message.id === marked) : -1;

  useEffect(() => {
    if (index === -1) return;

    const unmark = setTimeout(() => setMarked(undefined), MARK_MS);

    return () => clearTimeout(unmark);
  }, [index]);

  const jump = async (target: Pick<Message, 'id' | 'createdAt'>) => {
    let state: Pick<typeof thread, 'data' | 'hasNextPage' | 'hasPreviousPage'> = thread;

    for (;;) {
      const messages = threadOf(state.data);

      if (messages.some((message) => message.id === target.id)) return setMarked(target.id);

      const earlier = messages[0] !== undefined && target.createdAt < messages[0].createdAt;

      const next = earlier
        ? state.hasNextPage && (await thread.fetchNextPage())
        : state.hasPreviousPage && (await thread.fetchPreviousPage());

      if (!next || next.isError) {
        toast({ title: t('message-gone', 'That message is no longer in the thread') });

        return;
      }

      state = next;
    }
  };

  return { marked, markedAt: index, jump };
};

/**
 * The open conversation's messages, oldest at the top under a divider for each day, following
 * the newest as `useReader` says. Only the messages in view and a few around them render.
 */
export const MessageThread = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const thread = useMessages(conversation.id);
  const { messages, isPending } = thread;
  const customer = useCustomer(conversation.customerId);
  const viewport = useRef<HTMLDivElement>(null);
  const shift = usePrepended(messages);
  const { marked, markedAt, jump } = useJump(thread);
  const { rows, onScroll, onResize, atEnd, unseen, toEnd } = useReader(thread, markedAt);

  return (
    <>
      <PinnedBar conversationId={conversation.id} onJump={(message) => void jump(message)} />
      <ScrollArea.Root className="relative min-h-0 flex-1">
        <ScrollArea.Viewport ref={viewport}>
          {thread.error && messages.length === 0 ? (
            <p role="alert" className="p-6 text-center text-sm text-destructive-text">
              {thread.error.message}
            </p>
          ) : isPending ? (
            <ThreadSkeleton />
          ) : messages.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {t('no-messages-yet', 'No messages yet. Write the first one below.')}
            </p>
          ) : (
            <div className="mx-auto w-full max-w-2xl px-3">
              <Virtualizer
                ref={rows}
                scrollRef={viewport}
                data={messages}
                shift={shift}
                as={MessageList}
                item="li"
                onScroll={onScroll}
                onResize={onResize}
              >
                {(message, index) => (
                  <Fragment key={message.id}>
                    {/* The thread's edges sit inside its first and last rows, so virtua's offsets count them. */}
                    {index === 0 && <EarlierMessages thread={thread} />}
                    {toIsoDay(message.createdAt) !==
                      toIsoDay(messages[index - 1]?.createdAt ?? new Date(0)) && (
                      <DayDivider date={message.createdAt} />
                    )}
                    <Bubble
                      message={message}
                      customer={customer}
                      kind={conversation.kind}
                      first={!continues(message, messages[index - 1])}
                      marked={message.id === marked}
                    />
                    {index === messages.length - 1 && <div aria-hidden className="h-6" />}
                  </Fragment>
                )}
              </Virtualizer>
            </div>
          )}
          <LoadPage paging={thread} newer />
        </ScrollArea.Viewport>
        <ScrollArea.Bar />
        <LatestButton shown={!atEnd && messages.length > 0} unseen={unseen} onClick={toEnd} />
      </ScrollArea.Root>
    </>
  );
};
