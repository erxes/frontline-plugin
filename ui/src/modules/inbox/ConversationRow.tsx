import {
  Checkbox,
  cn,
  type CustomerContact,
  customerTitle,
  type RecordList,
  RelativeDateDisplay,
} from 'erxes-ui';
import { IconClockExclamation } from '@tabler/icons-react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { MemberAvatar, PersonAvatar } from '~/shared/Person.tsx';
import { isChat, KindIcon } from '~/shared/kinds.tsx';
import type { usePrefetch } from '~/shared/prefetch.ts';
import { useManyChannels } from '~/shared/channelField.ts';
import type { Conversation } from './queries.ts';
import { TagDot, usePickedTags } from './TagDot.tsx';

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
    <span className="relative mt-2.5 grid size-8 shrink-0 place-items-center">
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

/** How long a chat's customer waits for an answer before the row says so. */
const WAIT_MS = 5 * 60_000;

/** Whether the customer of an open chat wrote last and has waited five minutes or more. */
const isWaiting = (conversation: Conversation, now: number) =>
  conversation.customerRespondedLast &&
  conversation.status !== 'resolved' &&
  isChat(conversation.kind) &&
  now - conversation.lastMessageAt.getTime() >= WAIT_MS;

/** The last message's text, else what it sent, as the old list said: Photo, Video, Audio or File. */
const usePreview = ({ content, attachmentType }: Conversation) => {
  const { t } = useTranslation('frontline');

  if (content || attachmentType === null) return content;

  const media = attachmentType.split('/')[0];

  if (media === 'image') return t('preview-photo', 'Photo');

  if (media === 'video') return t('preview-video', 'Video');

  if (media === 'audio') return t('preview-audio', 'Audio');

  return t('preview-file', 'File');
};

/** How many tag dots a row shows before the rest count as +N. */
const ROW_TAGS = 3;

/** The conversation's tags as coloured dots beside its preview, each named on hover. */
const RowTags = ({ tagIds }: { tagIds: string[] }) => {
  const tags = usePickedTags(tagIds).filter((tag) => tag.colorCode);

  if (tags.length === 0) return null;

  const names = tags.map((tag) => tag.name).join(', ');
  const rest = tags.length - ROW_TAGS;

  return (
    <span title={names} className="flex shrink-0 items-center gap-0.5">
      {tags.slice(0, ROW_TAGS).map((tag) => (
        <TagDot key={tag.id} color={tag.colorCode} />
      ))}
      {rest > 0 && <span className="text-xs text-muted-foreground">+{rest}</span>}
      <span className="sr-only">{names}</span>
    </span>
  );
};

/**
 * The row's text on three lines, each kept to one line however long: the customer's name, bold
 * while unread, with a clock while they wait and the time at the end; the last message, with the
 * unread dot; and where it came from, the integration's mark and the channel, with its tags and
 * assignee. A read row's name and preview step back, so the unread ones stand out in a long list.
 */
const Summary = ({
  conversation,
  name,
  now,
}: {
  conversation: Conversation;
  name: string;
  now: number;
}) => {
  const { t } = useTranslation('frontline');
  const unread = !conversation.isRead;
  const waiting = isWaiting(conversation, now);
  const waitingLabel = t('waiting-answer', 'Waiting over 5 minutes for an answer');
  const preview = usePreview(conversation);
  const manyChannels = useManyChannels();

  return (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80',
          )}
        >
          {name}
        </span>
        {waiting && (
          <span title={waitingLabel} className="flex shrink-0 text-warning-text">
            <IconClockExclamation aria-hidden className="size-3.5" />
            <span className="sr-only">{waitingLabel}</span>
          </span>
        )}
        <span
          className={cn(
            'shrink-0 text-xs tabular-nums',
            waiting && 'font-medium text-warning-text',
            !waiting && unread && 'font-medium text-primary-text',
            !waiting && !unread && 'text-muted-foreground',
          )}
        >
          <RelativeDateDisplay.Value value={conversation.lastMessageAt.toISOString()} />
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            unread ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          {preview}
        </span>
        {unread && (
          <span className="size-2 shrink-0 rounded-full bg-primary">
            <span className="sr-only">{t('unread', 'Unread')}</span>
          </span>
        )}
      </span>
      <span className="flex h-4 min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <KindIcon
          kind={conversation.kind}
          thread={conversation.externalId}
          className="size-3.5 shrink-0"
        />
        {/* A member in one channel sees the integration; in several, which channel it came through. */}
        <span className="min-w-0 flex-1 truncate leading-4">
          {manyChannels ? conversation.channelName : conversation.integrationName}
        </span>
        {manyChannels && <span className="sr-only">{conversation.integrationName}</span>}
        <RowTags tagIds={conversation.tagIds} />
        {conversation.assigneeId && (
          <MemberAvatar
            id={conversation.assigneeId}
            label={(assignee) => t('assigned-to', 'Assigned to {{name}}', { name: assignee })}
          />
        )}
      </span>
    </>
  );
};

/** What the list reads once for every row: what is open and picked, and what to do. */
export type RowHandlers = {
  openId: string | null;
  /** The time to the minute, so a row knows how long its customer has waited. */
  now: number;
  selection: ReturnType<typeof RecordList.useSelection>;
  select: (conversation: Conversation) => void;
  prefetch: ReturnType<typeof usePrefetch<Conversation>>;
  onKeyDown: (event: KeyboardEvent) => void;
};

/**
 * One conversation as the old inbox showed it, the customer's avatar beside its summary.
 * Pointing at a row, or moving to it, loads its messages, so it opens at once; the arrow keys move on.
 */
export const ConversationRow = ({
  conversation,
  customer,
  handlers: { openId, now, selection, select, prefetch, onKeyDown },
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
    // Inset rounded rows with a gap of their own, not a rule under each: the open one is a filled
    // card with the primary edge, and the keys' focus rings the whole row.
    <div
      className={cn(
        'group relative mx-2 my-px flex items-start gap-3 rounded-lg px-2.5 transition-colors hover:bg-accent/60',
        'has-focus-visible:ring-2 has-focus-visible:ring-ring',
        (open || picked) && 'bg-accent hover:bg-accent',
        open &&
          'before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-primary',
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
        {...prefetch(conversation)}
        onKeyDown={onKeyDown}
        className="flex min-w-0 flex-1 flex-col gap-1 py-2.5 text-left outline-none"
      >
        <Summary conversation={conversation} name={name} now={now} />
      </button>
    </div>
  );
};
