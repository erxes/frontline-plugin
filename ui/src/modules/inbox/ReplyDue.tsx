import { IconAlarm, IconClockExclamation } from '@tabler/icons-react';
import { Badge, cn } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useMinute } from '~/shared/hooks.ts';
import { useSpanText } from '~/shared/spanText.ts';
import { isChat } from '~/shared/kinds.tsx';
import type { Conversation } from './queries.ts';

/** How long a chat's customer waits, in a channel that keeps no reply target, before it shows. */
const WAIT_MS = 5 * 60_000;

/**
 * Where the customer's wait for a reply stands: past the channel's target, near it (the channel
 * warned), or, in a chat with no target, five minutes or more; null when nobody waits.
 */
export const replyStateOf = (conversation: Conversation, now: number) => {
  const { waitingSince, replyDueAt, replyWarnedAt } = conversation;

  if (!waitingSince || conversation.status === 'resolved') return null;

  if (replyDueAt) {
    if (now >= replyDueAt.getTime()) return 'overdue';

    return replyWarnedAt ? 'soon' : null;
  }

  return isChat(conversation.kind) && now - waitingSince.getTime() >= WAIT_MS ? 'waiting' : null;
};

export type ReplyState = NonNullable<ReturnType<typeof replyStateOf>>;

/** What each state says, read out in the list and shown on hover. */
export const useReplyStateText = () => {
  const { t } = useTranslation('frontline');
  const span = useSpanText();

  return (state: ReplyState, conversation: Conversation, now: number) => {
    const due = conversation.replyDueAt?.getTime() ?? now;
    const waited = (now - (conversation.waitingSince?.getTime() ?? now)) / 1000;

    if (state === 'overdue')
      return t('reply-overdue-by', 'Reply overdue by {{span}}', {
        span: span((now - due) / 1000),
      });

    if (state === 'soon')
      return t('reply-due-in', 'Reply due in {{span}}', { span: span((due - now) / 1000) });

    return t('waiting-for', 'Waiting {{span}} for an answer', { span: span(waited) });
  };
};

/** The state's icon in a row: red past the target, amber near it or after a long wait. */
export const ReplyStateIcon = ({ state, label }: { state: ReplyState; label: string }) => (
  <span
    title={label}
    className={cn('flex shrink-0', state === 'overdue' ? 'text-destructive' : 'text-warning-text')}
  >
    {state === 'overdue' ? (
      <IconAlarm aria-hidden className="size-3.5" />
    ) : (
      <IconClockExclamation aria-hidden className="size-3.5" />
    )}
    <span className="sr-only">{label}</span>
  </span>
);

/** The open conversation's wait in its header: how long until the reply is due, or how late. */
export const ReplyDue = ({ conversation }: { conversation: Conversation }) => {
  const now = useMinute();
  const text = useReplyStateText();
  const { replyDueAt, waitingSince } = conversation;

  if (!waitingSince || !replyDueAt || conversation.status === 'resolved') return null;

  const state = replyStateOf(conversation, now);

  return (
    <Badge
      variant={state === 'overdue' ? 'destructive' : state === 'soon' ? 'warning' : 'secondary'}
      className="shrink-0"
    >
      {state === 'overdue' ? <IconAlarm /> : <IconClockExclamation />}
      {text(state ?? 'soon', conversation, now)}
    </Badge>
  );
};
