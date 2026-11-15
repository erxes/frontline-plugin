import { memberQueries } from '@erxes/core-contract/client';
import {
  IconAlertTriangle,
  IconLock,
  IconPencil,
  IconPin,
  IconPinnedOff,
  IconRobot,
} from '@tabler/icons-react';
import { Button, cn, MemberInline, ScrollArea, Skeleton, Textarea, useFormat } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { textOf } from '~/shared/hooks.ts';
import { useCustomerName } from './ConversationList.tsx';
import {
  type Conversation,
  type Message,
  useEditMessage,
  useMessages,
  usePinMessage,
  usePinnedMessages,
} from './queries.ts';

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

  return <MemberInline memberId={message.userId} members={memberQueries} size="sm" />;
};

/** The member's own message in a text box, saved with Save or Ctrl or ⌘ with Enter. */
const EditBox = ({ message, onDone }: { message: Message; onDone: () => void }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditMessage();

  const save = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const content = textOf(new FormData(event.currentTarget).get('content'));

    if (!content.trim() || content === message.content) return onDone();

    edit.mutate({ id: message.id, content }, { onSuccess: onDone });
  };

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <Textarea
        name="content"
        aria-label={t('edit-message', 'Edit message')}
        defaultValue={message.content}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey))
            event.currentTarget.form?.requestSubmit();

          if (event.key === 'Escape') onDone();
        }}
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
        <p
          className={cn(
            'whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
            fromCustomer && 'bg-muted',
            !fromCustomer && !message.internal && 'bg-primary text-primary-foreground',
            message.internal && 'border border-dashed bg-warning-surface',
          )}
        >
          {message.content}
        </p>
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
