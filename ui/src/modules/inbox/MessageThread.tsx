import { IconPin } from '@tabler/icons-react';
import { Button, ScrollArea, Skeleton, toIsoDay, useFormat } from 'erxes-ui';
import { Fragment, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type CustomContainerComponentProps, Virtualizer, type VirtualizerHandle } from 'virtua';
import { type Conversation, type Message, useMessages, usePinnedMessages } from './queries.ts';
import { LoadPage } from '~/shared/List.tsx';
import { useCustomer } from '~/shared/Person.tsx';
import { Bubble, continues } from './MessageBubble.tsx';

/** The conversation's pinned messages, above its thread, as the old inbox kept them. */
const Pinned = ({ conversationId }: { conversationId: string }) => {
  const { t } = useTranslation('frontline');
  const pinned = usePinnedMessages(conversationId).data?.messages ?? [];

  if (pinned.length === 0) return null;

  return (
    <section
      aria-label={t('pinned-messages', 'Pinned messages')}
      className="flex flex-col gap-1 border-b bg-muted px-4 py-2"
    >
      {pinned.map((message) => (
        <p key={message.id} className="flex items-center gap-2 truncate text-xs">
          <IconPin className="size-3 shrink-0" aria-hidden />
          {message.content}
        </p>
      ))}
    </section>
  );
};

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

/**
 * The open conversation's messages, oldest at the top under a divider for each day, scrolled to
 * the newest as one arrives; earlier ones load on demand. Only the messages in view and a few
 * around them render.
 */
export const MessageThread = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const thread = useMessages(conversation.id);
  const { messages, isPending, hasNextPage, fetchNextPage } = thread;
  const customer = useCustomer(conversation.customerId);
  const viewport = useRef<HTMLDivElement>(null);
  const rows = useRef<VirtualizerHandle>(null);
  const shift = usePrepended(messages);
  // While the newest messages are dropped for older ones, the last shown is no new arrival.
  const lastId = thread.hasPreviousPage ? undefined : messages.at(-1)?.id;

  // virtua clamps the index to the last message and scrolls again once it measured the rows.
  useEffect(() => {
    if (lastId) rows.current?.scrollToIndex(Infinity, { align: 'end' });
  }, [lastId]);

  return (
    <>
      <Pinned conversationId={conversation.id} />
      <ScrollArea.Root className="min-h-0 flex-1">
        <ScrollArea.Viewport ref={viewport}>
          {isPending ? (
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
              >
                {(message, index) => (
                  <Fragment key={message.id}>
                    {/* The thread's edges sit inside its first and last rows, so virtua's offsets count them. */}
                    {index === 0 && (
                      <div className="pt-6">
                        {hasNextPage && (
                          <Button
                            variant="ghost"
                            className="mb-3"
                            onClick={() => void fetchNextPage()}
                          >
                            {t('earlier-messages', 'Earlier messages')}
                          </Button>
                        )}
                      </div>
                    )}
                    {toIsoDay(message.createdAt) !==
                      toIsoDay(messages[index - 1]?.createdAt ?? new Date(0)) && (
                      <DayDivider date={message.createdAt} />
                    )}
                    <Bubble
                      message={message}
                      customer={customer}
                      kind={conversation.kind}
                      first={!continues(message, messages[index - 1])}
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
      </ScrollArea.Root>
    </>
  );
};
