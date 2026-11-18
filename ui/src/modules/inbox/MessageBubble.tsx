import {
  IconAlertTriangle,
  IconClock,
  IconCopy,
  IconLock,
  IconPencil,
  IconPin,
  IconPinnedOff,
  IconRefresh,
  IconRobot,
} from '@tabler/icons-react';
import { Button, cn, Editor, editorText, toast, toIsoDay, useFormat } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SentSurvey } from '~/modules/surveys/SurveyMessage.tsx';
import { MemberLine, PersonAvatar } from '~/shared/Person.tsx';
import type { Message } from './queries.ts';
import { useEditMessage, usePinMessage, useRetryMessage } from './changes.ts';
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

/**
 * Scrolls the edit box's buttons into view as it opens. On the newest message the taller box
 * would end below the thread, and Save would move under the pointer as the list scrolled to it.
 */
const reveal = (buttons: HTMLDivElement | null) => buttons?.scrollIntoView({ block: 'nearest' });

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
      <div ref={reveal} className="flex justify-end gap-2">
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

/** When a message was written, and whether it was edited or is internal. */
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
    </>
  );
};

/**
 * Under each of the team's replies that hasn't reached the customer: on its way while its
 * provider is asked, or not delivered, with a button that sends it again.
 */
const Delivery = ({ message }: { message: Message }) => {
  const { t } = useTranslation('frontline');
  const retry = useRetryMessage();

  if (message.deliveryStatus === 'queued' || message.deliveryStatus === 'sending')
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <IconClock className="size-3" aria-hidden />
        {t('sending', 'Sending')}
      </span>
    );

  if (message.deliveryStatus !== 'failed') return null;

  return (
    <span className="flex items-center gap-1 text-xs text-destructive-text">
      <IconAlertTriangle className="size-3" aria-hidden />
      {t('not-delivered', 'Not delivered')}
      <Button
        variant="ghost"
        size="xs"
        disabled={retry.isPending}
        onClick={() => retry.mutate({ id: message.id })}
      >
        <IconRefresh />
        {t('send-again', 'Send again')}
      </Button>
    </span>
  );
};

/** Two messages from one author this close together read as one run, under one name. */
const RUN_MS = 5 * 60_000;

/** Whether `message` continues the run of the one before it: the same author, minutes apart. */
export const continues = (message: Message, previous: Message | undefined) =>
  previous !== undefined &&
  previous.customerId === message.customerId &&
  previous.userId === message.userId &&
  previous.internal === message.internal &&
  message.createdAt.getTime() - previous.createdAt.getTime() < RUN_MS &&
  toIsoDay(message.createdAt) === toIsoDay(previous.createdAt);

/** Copies the message's text and says so. */
const useCopy = () => {
  const { t } = useTranslation('frontline');

  // A page outside a secure context has no clipboard; that refuses as well.
  return (text: string) =>
    Promise.resolve(text)
      .then((copied) => navigator.clipboard.writeText(copied))
      .then(
        () => toast({ title: t('copied', 'Copied') }),
        () =>
          toast({ title: t('copy-failed', 'The browser refused to copy'), variant: 'destructive' }),
      );
};

/**
 * Copy, pin and edit, beside the bubble on hover or focus; a pinned message keeps its unpin
 * button in view.
 */
const MessageTools = ({ message, onEdit }: { message: Message; onEdit: () => void }) => {
  const { t } = useTranslation('frontline');
  const pin = usePinMessage();
  const copy = useCopy();
  const pinned = Boolean(message.pinnedAt);

  return (
    <>
      {message.content && (
        <Button
          variant="ghost"
          size="icon"
          className="size-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label={t('copy-text', 'Copy text')}
          onClick={() => void copy(message.content)}
        >
          <IconCopy />
        </Button>
      )}
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
export const Bubble = ({
  message,
  customer,
  kind,
  first,
  marked = false,
}: {
  message: Message;
  customer: { name: string; avatarUrl?: string | null };
  kind: string;
  first: boolean;
  /** The message the member just jumped to, shaded for a moment so they find it. */
  marked?: boolean;
}) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const [editing, setEditing] = useState(false);
  const fromCustomer = Boolean(message.customerId);

  return (
    <article
      aria-label={message.internal ? t('internal-note', 'Internal note') : t('message', 'Message')}
      title={first ? undefined : format.dateTime(message.createdAt)}
      className={cn(
        'group flex gap-2 rounded-md pb-1 transition-colors',
        !fromCustomer && 'flex-row-reverse',
        first && 'mt-3',
        marked && 'bg-muted',
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
        {!fromCustomer && !message.internal && <Delivery message={message} />}
        <Attachments files={message.attachments} />
        <LinkPreviews message={message} />
        {message.surveyId && <SentSurvey surveyId={message.surveyId} />}
        <Reactions message={message} kind={kind} />
      </div>
    </article>
  );
};
