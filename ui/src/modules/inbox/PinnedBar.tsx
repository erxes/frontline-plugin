import { IconPin, IconPinnedOff } from '@tabler/icons-react';
import { Button, IconTip } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { usePinMessage } from './changes.ts';
import { usePinnedMessages } from './queries.ts';

/**
 * The conversation's pinned messages above its thread, as the old inbox kept them. A click goes to
 * the message in the thread, and each unpins from here.
 */
export const PinnedBar = ({
  conversationId,
  onJump,
}: {
  conversationId: string;
  onJump: (messageId: string) => void;
}) => {
  const { t } = useTranslation('frontline');
  const pinned = usePinnedMessages(conversationId).data?.messages ?? [];
  const pin = usePinMessage();
  const unpin = t('unpin', 'Unpin');

  if (pinned.length === 0) return null;

  return (
    <section
      aria-label={t('pinned-messages', 'Pinned messages')}
      className="flex flex-col border-b bg-muted px-2 py-1"
    >
      <ul>
        {pinned.map((message) => (
          <li key={message.id} className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onJump(message.id)}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1 text-left text-xs hover:bg-accent"
            >
              <IconPin className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{message.content}</span>
            </button>
            <IconTip label={unpin}>
              <Button
                variant="ghost"
                tone="muted"
                size="icon"
                aria-label={unpin}
                onClick={() => pin.mutate({ id: message.id, pinned: false })}
              >
                <IconPinnedOff />
              </Button>
            </IconTip>
          </li>
        ))}
      </ul>
    </section>
  );
};
