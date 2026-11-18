import {
  IconAlertTriangle,
  IconLock,
  IconPencil,
  IconPin,
  IconPinnedOff,
  IconRobot,
} from '@tabler/icons-react';
import {
  Button,
  cn,
  Editor,
  editorText,
  ScrollArea,
  Skeleton,
  toIsoDay,
  useFormat,
} from 'erxes-ui';
import { Fragment, type SubmitEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Conversation, type Message, useMessages, usePinnedMessages } from './queries.ts';
import { useEditMessage, usePinMessage } from './changes.ts';
import { SentSurvey } from '~/modules/surveys/SurveyMessage.tsx';
import { MemberLine, PersonAvatar, useCustomer } from '~/shared/Person.tsx';
import { Attachments, LinkPreviews, MessageBody } from './MessageContent.tsx';
import { Reactions } from './Reactions.tsx';
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

/** When a message was written, and whether it was edited, is internal or failed to go out. */
const Marks = ({ message }: { message: Message }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  return (
    <>
      <time dateTime={message.createdAt.toISOString()} title={format.dateTime(message.createdAt)}>
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
    </>
  );
};

/** Two messages from one author this close together read as one run, under one name. */
const RUN_MS = 5 * 60_000;

/** Whether `message` continues the run of the one before it: the same author, minutes apart. */
const continues = (message: Message, previous: Message | undefined) =>
  previous !== undefined &&
  previous.customerId === message.customerId &&
  previous.userId === message.userId &&
  previous.internal === message.internal &&
  message.createdAt.getTime() - previous.createdAt.getTime() < RUN_MS &&
  toIsoDay(message.createdAt) === toIsoDay(previous.createdAt);

/** Pin and edit, beside the bubble on hover; a pinned message keeps its unpin button in view. */
const MessageTools = ({ message, onEdit }: { message: Message; onEdit: () => void }) => {
  const { t } = useTranslation('frontline');
  const pin = usePinMessage();
  const pinned = Boolean(message.pinnedAt);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={cn('size-6', !pinned && 'opacity-0 group-hover:opacity-100 focus:opacity-100')}
        aria-label={pinned ? t('unpin', 'Unpin') : t('pin', 'Pin')}
        onClick={() => pin.mutate({ id: message.id, pinned: !pinned })}
      >
        {pinned ? <IconPinnedOff /> : <IconPin />}
      </Button>
      {message.canEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="size-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label={t('edit-message', 'Edit message')}
          onClick={onEdit}
        >
          <IconPencil />
        </Button>
      )}
    </>
  );
};

/**
 * One message: the customer's on the left beside their avatar, the team's on the right. The first
 * of a run carries the author and time; the rest of the run sits close under it, its own time in
 * its tooltip.
 */
const Bubble = ({
  message,
  customer,
  kind,
  first,
}: {
  message: Message;
  customer: { name: string; avatarUrl?: string | null };
  kind: string;
  first: boolean;
}) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const [editing, setEditing] = useState(false);
  const fromCustomer = Boolean(message.customerId);

  return (
    <li
      aria-label={message.internal ? t('internal-note', 'Internal note') : t('message', 'Message')}
      title={first ? undefined : format.dateTime(message.createdAt)}
      className={cn(
        'group flex max-w-2xl gap-2',
        !fromCustomer && 'flex-row-reverse self-end',
        first && 'mt-3',
      )}
    >
      {fromCustomer && (
        <span className="size-8 shrink-0">
          {first && <PersonAvatar name={customer.name} src={customer.avatarUrl} className="mt-6" />}
        </span>
      )}
      <div className={cn('flex min-w-0 flex-col gap-1', !fromCustomer && 'items-end')}>
        {first && (
          <span
            className={cn(
              'flex h-6 items-center gap-2 text-xs text-muted-foreground',
              !fromCustomer && 'flex-row-reverse',
            )}
          >
            <Author message={message} customerName={customer.name} />
            <Marks message={message} />
          </span>
        )}
        {editing ? (
          <EditBox message={message} onDone={() => setEditing(false)} />
        ) : (
          <span className={cn('flex items-center gap-1', !fromCustomer && 'flex-row-reverse')}>
            <MessageBody message={message} />
            <MessageTools message={message} onEdit={() => setEditing(true)} />
          </span>
        )}
        <Attachments files={message.attachments} />
        <LinkPreviews message={message} />
        {message.surveyId && <SentSurvey surveyId={message.surveyId} />}
        <Reactions message={message} kind={kind} />
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
    <li className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
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
  const customer = useCustomer(conversation.customerId);
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
          <ol
            aria-label={t('messages', 'Messages')}
            className="mx-auto flex w-full max-w-2xl flex-col gap-1 px-3 py-6"
          >
            {messages.map((message, index) => (
              <Fragment key={message.id}>
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
              </Fragment>
            ))}
          </ol>
        )}
        <div ref={end} />
      </ScrollArea>
    </>
  );
};
