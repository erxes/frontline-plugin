import { IconArrowBackUp, IconCopy, IconPencil, IconPin, IconPinnedOff } from '@tabler/icons-react';
import { Button, cn, useFormat } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useCopy } from '~/shared/hooks.ts';
import type { Message } from './queries.ts';
import { usePinMessage } from './changes.ts';
import { MessageBody } from './MessageContent.tsx';

/**
 * Reply, copy, pin and edit, beside the bubble on hover or focus; a pinned message keeps its unpin
 * button in view. Reply shows where a reply can answer one message.
 */
const MessageTools = ({
  message,
  onEdit,
  onReply,
}: {
  message: Message;
  onEdit: () => void;
  onReply?: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const pin = usePinMessage();
  const copy = useCopy();
  const pinned = Boolean(message.pinnedAt);

  return (
    <>
      {onReply && (
        <Button
          variant="ghost"
          size="icon"
          className="size-6 opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label={t('reply-to-message', 'Reply to this message')}
          onClick={onReply}
        >
          <IconArrowBackUp />
        </Button>
      )}
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
 * The bubble and, beside it by its first line however tall it is, its tools; a message after the
 * first of its run shows its time there on hover, since it has no line of its own.
 */
export const BubbleRow = ({
  message,
  first,
  onEdit,
  onReply,
}: {
  message: Message;
  first: boolean;
  onEdit: () => void;
  onReply?: () => void;
}) => {
  const format = useFormat();
  const fromCustomer = Boolean(message.customerId);

  return (
    <span
      className={cn(
        'flex min-w-0 max-w-full items-start gap-1',
        !fromCustomer && 'flex-row-reverse',
      )}
    >
      <MessageBody message={message} first={first} />
      <span
        className={cn(
          'flex shrink-0 items-center gap-0.5 pt-1',
          !fromCustomer && 'flex-row-reverse',
        )}
      >
        <MessageTools message={message} onEdit={onEdit} onReply={onReply} />
        {!first && (
          <time
            dateTime={message.createdAt.toISOString()}
            className="px-1 text-xs text-muted-foreground opacity-0 group-hover:opacity-100"
          >
            {format.time(message.createdAt)}
          </time>
        )}
      </span>
    </span>
  );
};
