import { IconArrowDown } from '@tabler/icons-react';
import { Button, cn, ScrollArea, Skeleton, Spinner, toIsoDay, useFormat } from 'erxes-ui';
import { Fragment, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type CustomContainerComponentProps, Virtualizer } from 'virtua';
import { type Conversation, type Message, useMessages } from './queries.ts';
import { LoadPage } from '~/shared/List.tsx';
import { takesNotesOnly } from '~/shared/kinds.tsx';
import { useCustomer } from '~/shared/Person.tsx';
import type { Sending } from './changes.ts';
import { focusComposer } from './Composer.tsx';
import { useQuote } from './composerDraft.ts';
import { Bubble, continues, type QuoteLink, quoteText } from './MessageBubble.tsx';
import { SendingMessage } from './MessageContent.tsx';
import { PinnedBar } from './PinnedBar.tsx';
import { useJump, usePrepended, useReader } from './threadScroll.ts';

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
 * Quotes in the thread: what each reply answers, from the messages loaded or else the API's copy
 * of its text, and Reply on each message, which puts it over the composer. A note, and a
 * conversation that takes notes only, take no reply.
 */
const useQuotes = (
  conversation: Conversation,
  messages: Message[],
  jump: ReturnType<typeof useJump>['jump'],
) => {
  const { t } = useTranslation('frontline');
  const quote = useQuote(conversation.id);
  const replies = !takesNotesOnly(conversation.kind);
  const textOf = (text: string) => text || t('a-file', 'A file');

  const quoteOf = (message: Message): QuoteLink | undefined => {
    const { replyToId, quotedContent } = message;

    if (!replyToId) return undefined;

    const loaded = messages.find((other) => other.id === replyToId);

    return {
      text: loaded
        ? textOf(quoteText(loaded))
        : quotedContent === null
          ? t('earlier-message', 'An earlier message')
          : textOf(quotedContent),
      // It came before the reply, so it is among the messages loaded or before them.
      onJump: () => void jump({ id: replyToId, createdAt: new Date(0) }),
    };
  };

  const replyOf = (message: Message) =>
    replies && !message.internal
      ? () => {
          quote({ id: message.id, text: textOf(quoteText(message)) });
          focusComposer();
        }
      : undefined;

  return { quoteOf, replyOf };
};

type ThreadProps = {
  conversation: Conversation;
  /** The member's message on its way, shown faded under the thread until it is saved. */
  sending?: Sending;
};

/**
 * The open conversation's messages, oldest at the top under a divider for each day, following
 * the newest as `useReader` says. Only the messages in view and a few around them render.
 */
export const MessageThread = ({ conversation, sending }: ThreadProps) => {
  const { t } = useTranslation('frontline');
  const thread = useMessages(conversation.id);
  const { messages, isPending } = thread;
  const customer = useCustomer(conversation.customerId);
  const shift = usePrepended(messages);
  const { marked, markedAt, jump } = useJump(thread);
  const { quoteOf, replyOf } = useQuotes(conversation, messages, jump);

  const { rows, viewport, onScroll, onResize, atEnd, unseen, toEnd } = useReader(
    thread,
    markedAt,
    sending,
  );

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
          ) : messages.length === 0 && !sending ? (
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
                      quote={quoteOf(message)}
                      onReply={replyOf(message)}
                    />
                    {index === messages.length - 1 && <div aria-hidden className="h-6" />}
                  </Fragment>
                )}
              </Virtualizer>
              {sending && <SendingMessage sending={sending} />}
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
