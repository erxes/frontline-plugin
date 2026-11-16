import {
  IconAlertTriangle,
  IconFile,
  IconLock,
  IconPencil,
  IconPin,
  IconPinnedOff,
  IconRobot,
} from '@tabler/icons-react';
import {
  Avatar,
  Button,
  cn,
  Editor,
  editorText,
  ScrollArea,
  Skeleton,
  toIsoDay,
  useFormat,
} from 'erxes-ui';
import parse from 'html-react-parser';
import { Fragment, type SubmitEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCustomerName } from './ConversationList.tsx';
import {
  type Conversation,
  type Message,
  useEditMessage,
  useMessages,
  usePinMessage,
  usePinnedMessages,
} from './queries.ts';
import { SentSurvey } from '~/modules/surveys/SurveyMessage.tsx';
import { MemberLine } from '~/shared/MemberLine.tsx';
import { useSendShortcut } from './useSendShortcut.ts';

/** Who wrote the message: the customer, a member, or the bot when it has neither. */
const Author = ({ message, customerName }: { message: Message; customerName: string }) => {
  const { t } = useTranslation('frontline');

  if (message.customerId) return customerName;

  if (!message.userId)
    return (
      <span className="flex items-center gap-1">
        <IconRobot className="size-3" aria-hidden />
        {t('bot', 'Bot')}
      </span>
    );

  return <MemberLine id={message.userId} size="sm" />;
};

/** The member's own message in the editor, saved with Save or Ctrl or ⌘ with Enter. */
const EditBox = ({ message, onDone }: { message: Message; onDone: () => void }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditMessage();
  // Empty until the member changes something.
  const [html, setHtml] = useState('');

  const save = (event?: SubmitEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (!editorText(html)) return onDone();

    edit.mutate({ id: message.id, html }, { onSuccess: onDone });
  };

  const shortcut = useSendShortcut({ send: save, cancel: onDone });

  return (
    <form ref={shortcut} onSubmit={save} className="flex flex-col gap-2">
      <Editor
        label={t('edit-message', 'Edit message')}
        initialContent={message.html ?? message.content}
        isHTML
        sideMenu={false}
        className="min-h-16"
        onChange={setHtml}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t('cancel', 'Cancel')}
        </Button>
        <Button type="submit" size="sm" disabled={edit.isPending}>
          {t('save', 'Save')}
        </Button>
      </div>
    </form>
  );
};

/**
 * What the message says: a member's rich text as the API sanitized it (`api/src/modules/inbox/html.ts`),
 * else its plain text.
 */
const MessageBody = ({ message }: { message: Message }) => {
  const fromCustomer = Boolean(message.customerId);

  const bot = !fromCustomer && !message.userId;

  const className = cn(
    'break-words rounded-2xl px-3 py-2 text-sm',
    fromCustomer && 'rounded-tl-sm bg-muted',
    !fromCustomer && 'rounded-tr-sm',
    !fromCustomer && !message.internal && !bot && 'bg-primary text-primary-foreground',
    bot && !message.internal && 'border border-primary/40 bg-primary/5',
    message.internal && 'border border-dashed border-warning bg-warning/20',
  );

  if (!message.html)
    return <p className={cn('whitespace-pre-wrap', className)}>{message.content}</p>;

  return (
    <div
      className={cn(
        className,
        'flex flex-col gap-1 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_[data-inline-content-type=mention]]:font-semibold',
      )}
    >
      {parse(message.html)}
    </div>
  );
};

/** The message's files: images as thumbnails, the rest as chips with their name. */
const Attachments = ({ files }: { files: Message['attachments'] }) => {
  if (files.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((file) => (
        <li key={file.url}>
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="flex max-w-60 items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs hover:bg-accent"
          >
            {file.type?.startsWith('image/') ? (
              <img src={file.url} alt={file.name} className="max-h-40 rounded-sm" />
            ) : (
              <>
                <IconFile className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{file.name}</span>
              </>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
};

const Bubble = ({ message, customerName }: { message: Message; customerName: string }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const pin = usePinMessage();
  const [editing, setEditing] = useState(false);
  const fromCustomer = Boolean(message.customerId);
  const pinned = Boolean(message.pinnedAt);

  return (
    <li
      aria-label={message.internal ? t('internal-note', 'Internal note') : t('message', 'Message')}
      className={cn('group flex max-w-2xl gap-2', !fromCustomer && 'flex-row-reverse self-end')}
    >
      {fromCustomer && (
        <Avatar size="lg" className="mt-6 shrink-0">
          <Avatar.Fallback>{customerName.charAt(0).toUpperCase()}</Avatar.Fallback>
        </Avatar>
      )}
      <div className={cn('flex min-w-0 flex-col gap-1', !fromCustomer && 'items-end')}>
        <span
          className={cn(
            'flex h-6 items-center gap-2 text-xs text-muted-foreground',
            !fromCustomer && 'flex-row-reverse',
          )}
        >
          <Author message={message} customerName={customerName} />
          <time
            dateTime={message.createdAt.toISOString()}
            title={format.dateTime(message.createdAt)}
          >
            {format.time(message.createdAt)}
          </time>
          {message.editedAt && <span>{t('edited', 'Edited')}</span>}
          {message.internal && <IconLock className="size-3" aria-hidden />}
          {message.deliveryStatus === 'failed' && (
            <span className="flex items-center gap-1 text-destructive-text">
              <IconAlertTriangle className="size-3" aria-hidden />
              {t('not-delivered', 'Not delivered')}
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'size-6',
              !pinned && 'opacity-0 group-hover:opacity-100 focus:opacity-100',
            )}
            aria-label={pinned ? t('unpin', 'Unpin') : t('pin', 'Pin')}
            onClick={() => pin.mutate({ id: message.id, pinned: !pinned })}
          >
            {pinned ? <IconPinnedOff /> : <IconPin />}
          </Button>
          {message.canEdit && !editing && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
              aria-label={t('edit-message', 'Edit message')}
              onClick={() => setEditing(true)}
            >
              <IconPencil />
            </Button>
          )}
        </span>
        {editing ? (
          <EditBox message={message} onDone={() => setEditing(false)} />
        ) : (
          <MessageBody message={message} />
        )}
        <Attachments files={message.attachments} />
        {message.surveyId && <SentSurvey surveyId={message.surveyId} />}
      </div>
    </li>
  );
};

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
    <li className="flex items-center gap-3 text-xs text-muted-foreground">
      <hr className="flex-1" />
      {label}
      <hr className="flex-1" />
    </li>
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

/**
 * The open conversation's messages, oldest at the top under a divider for each day, scrolled to
 * the newest as one arrives; earlier ones load on demand.
 */
export const MessageThread = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const { messages, isPending, hasNextPage, fetchNextPage } = useMessages(conversation.id);
  const customerName = useCustomerName(conversation.customerId);
  const end = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;

  useEffect(() => {
    if (lastId) end.current?.scrollIntoView({ block: 'end' });
  }, [lastId]);

  return (
    <>
      <Pinned conversationId={conversation.id} />
      <ScrollArea className="min-h-0 flex-1">
        {hasNextPage && (
          <Button variant="ghost" className="m-3" onClick={() => void fetchNextPage()}>
            {t('earlier-messages', 'Earlier messages')}
          </Button>
        )}
        {isPending ? (
          <ThreadSkeleton />
        ) : messages.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            {t('no-messages-yet', 'No messages yet. Write the first one below.')}
          </p>
        ) : (
          <ol aria-label={t('messages', 'Messages')} className="flex flex-col gap-4 p-4">
            {messages.map((message, index) => (
              <Fragment key={message.id}>
                {toIsoDay(message.createdAt) !==
                  toIsoDay(messages[index - 1]?.createdAt ?? new Date(0)) && (
                  <DayDivider date={message.createdAt} />
                )}
                <Bubble message={message} customerName={customerName} />
              </Fragment>
            ))}
          </ol>
        )}
        <div ref={end} />
      </ScrollArea>
    </>
  );
};
