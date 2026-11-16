import {
  IconAlertTriangle,
  IconLock,
  IconPencil,
  IconPin,
  IconPinnedOff,
  IconRobot,
} from '@tabler/icons-react';
import { Button, cn, Editor, editorText, ScrollArea, Skeleton, useFormat } from 'erxes-ui';
import parse from 'html-react-parser';
import { type SubmitEvent, useState } from 'react';
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

  const className = cn(
    'break-words rounded-lg px-3 py-2 text-sm',
    fromCustomer && 'bg-muted',
    !fromCustomer && !message.internal && 'bg-primary text-primary-foreground',
    message.internal && 'border border-dashed bg-warning-surface',
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
      className={cn('group flex max-w-xl flex-col gap-1', !fromCustomer && 'self-end')}
    >
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <Author message={message} customerName={customerName} />
        <span>{format.dateTime(message.createdAt)}</span>
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
          className={cn('size-6', !pinned && 'opacity-0 group-hover:opacity-100 focus:opacity-100')}
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
      {message.attachments.map((file) => (
        <a
          key={file.url}
          href={file.url}
          className="text-xs underline"
          target="_blank"
          rel="noreferrer"
        >
          {file.name}
        </a>
      ))}
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

/** The open conversation's messages, oldest at the top; earlier ones load on demand. */
export const MessageThread = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const { messages, isPending, hasNextPage, fetchNextPage } = useMessages(conversation.id);
  const customerName = useCustomerName(conversation.customerId);

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
          <Skeleton className="m-4 h-24" />
        ) : (
          <ol aria-label={t('messages', 'Messages')} className="flex flex-col gap-4 p-4">
            {messages.map((message) => (
              <Bubble key={message.id} message={message} customerName={customerName} />
            ))}
          </ol>
        )}
      </ScrollArea>
    </>
  );
};
