import {
  Checkbox,
  cn,
  type CustomerContact,
  customerTitle,
  type RecordList,
  RelativeDateDisplay,
} from 'erxes-ui';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { PersonAvatar } from '~/shared/Person.tsx';
import { KindIcon } from '~/shared/kinds.tsx';
import type { Conversation } from './queries.ts';

/** The list's row buttons carry the conversation's id, so the keys can move the focus between them. */
export const ROW = 'data-conversation-id';

/**
 * The customer's avatar, and in its place on hover or focus, or once any row is picked, a
 * checkbox for the bar's bulk actions.
 */
const Pick = ({
  name,
  avatarUrl,
  picked,
  picking,
  onToggle,
}: {
  name: string;
  avatarUrl?: string | null;
  picked: boolean;
  /** Whether any row is picked, so every row shows its checkbox. */
  picking: boolean;
  onToggle: () => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <span className="relative grid size-8 shrink-0 place-items-center">
      <span className={picking ? 'opacity-0' : 'group-hover:opacity-0'}>
        <PersonAvatar name={name} src={avatarUrl} />
      </span>
      <Checkbox
        aria-label={t('select-name', 'Select {{name}}', { name })}
        checked={picked}
        onCheckedChange={onToggle}
        className={cn(
          'absolute',
          !picking && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
        )}
      />
    </span>
  );
};

/**
 * The row's text: the customer's name, bold while unread, the integration's icon and the
 * channel, the time, and the last message under them.
 */
const Summary = ({ conversation, name }: { conversation: Conversation; name: string }) => {
  const { t } = useTranslation('frontline');
  const unread = !conversation.isRead;

  return (
    <>
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'min-w-0 truncate text-sm',
            unread ? 'font-semibold text-foreground' : 'font-medium',
          )}
        >
          {name}
        </span>
        <KindIcon kind={conversation.kind} className="size-3.5 shrink-0" />
        <span className="sr-only">{conversation.integrationName}</span>
        {/* A list dragged narrow leaves the name and the time, not two names cut to a letter. */}
        <span className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground @sm:block">
          {conversation.channelName}
        </span>
        <span
          className={cn(
            'ml-auto shrink-0 text-xs',
            unread ? 'font-medium text-primary-text' : 'text-muted-foreground',
          )}
        >
          <RelativeDateDisplay.Value value={conversation.lastMessageAt.toISOString()} />
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            unread ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {conversation.content}
        </span>
        {unread && (
          <span className="size-2 shrink-0 rounded-full bg-primary">
            <span className="sr-only">{t('unread', 'Unread')}</span>
          </span>
        )}
      </span>
    </>
  );
};

/** What the list reads once for every row: what is open and picked, and what to do. */
export type RowHandlers = {
  openId: string | null;
  selection: ReturnType<typeof RecordList.useSelection>;
  select: (conversation: Conversation) => void;
  prefetch: (conversation: Conversation) => void;
  onKeyDown: (event: KeyboardEvent) => void;
};

/**
 * One conversation as the old inbox showed it, the customer's avatar beside its summary.
 * Resting the pointer on a row loads its messages, so it opens at once; the arrow keys move on.
 */
export const ConversationRow = ({
  conversation,
  customer,
  handlers: { openId, selection, select, prefetch, onKeyDown },
}: {
  conversation: Conversation;
  customer: CustomerContact | undefined;
  handlers: RowHandlers;
}) => {
  const { t } = useTranslation('frontline');
  const name = (customer && customerTitle(customer)) || t('visitor', 'Visitor');
  const open = openId === conversation.id;
  const picked = selection.has(conversation.id);

  return (
    <div
      className={cn(
        'group relative flex items-center gap-3 border-b px-3 hover:bg-accent/60',
        (open || picked) && 'bg-accent hover:bg-accent',
        open && 'before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-primary',
      )}
    >
      <Pick
        name={name}
        avatarUrl={customer?.avatarUrl}
        picked={picked}
        picking={selection.ids.length > 0}
        onToggle={() => selection.toggle(conversation.id)}
      />
      <button
        type="button"
        {...{ [ROW]: conversation.id }}
        aria-current={open ? 'true' : undefined}
        onClick={() => select(conversation)}
        onPointerEnter={() => prefetch(conversation)}
        onFocus={() => prefetch(conversation)}
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-1 flex-col gap-1 py-2.5 text-left outline-none"
      >
        <Summary conversation={conversation} name={name} />
      </button>
    </div>
  );
};
