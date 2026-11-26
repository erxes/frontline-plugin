import {
  IconCheck,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconPlus,
  IconRefresh,
  IconTag,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  cn,
  EntityPicker,
  IconTip,
  Popover,
  Separator,
  stored,
  useCurrentRecord,
  useMediaQuery,
  useOpenRecord,
} from 'erxes-ui';
import { atom, useAtom } from 'jotai';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { PLUGIN } from '~/plugin.ts';
import { MemberButton } from '~/shared/MemberPicker.tsx';
import { ConversationIdentity } from './ConversationIdentity.tsx';
import { ConversationMenu } from './ConversationPresence.tsx';
import { ReplyDue } from './ReplyDue.tsx';
import { type Conversation, conversationTags, useCreateTag } from './queries.ts';
import { ConversationCall } from './ConversationCall.tsx';
import { ConversationTickets } from './ConversationTickets.tsx';
import { TagDot, usePickedTags } from './TagDot.tsx';
import { useAssign, useSetStatus, useSetTags } from './changes.ts';

/**
 * A button named `label` that opens the conversation tags, `tagIds` picked, and sets them on each
 * of `ids`; the search makes a new one. `children` shows on the button in place of the label.
 */
export const TagEditor = ({
  ids,
  tagIds,
  label,
  compact = false,
  children,
}: {
  ids: string[];
  tagIds: string[];
  label: string;
  /** In a narrow header (a `@container`), only the icon and how many tags, the rest by name on hover. */
  compact?: boolean;
  children?: ReactNode;
}) => {
  const { t } = useTranslation('frontline');
  const tags = useQuery(conversationTags);
  const setTags = useSetTags();
  const create = useCreateTag();
  const save = (picked: string[]) => setTags.mutate({ ids, tagIds: picked });

  return (
    <Popover>
      <Popover.Trigger
        render={
          <Button variant="outline" size="sm" className="max-w-60 min-w-0">
            <IconTag />
            {children ? (
              <>
                <span className="sr-only">{label}</span>
                <span
                  className={cn('flex min-w-0 items-center gap-1.5', compact && 'hidden @3xl:flex')}
                >
                  {children}
                </span>
                {compact && (
                  <span aria-hidden className="@3xl:hidden">
                    {tagIds.length}
                  </span>
                )}
              </>
            ) : (
              <span className={cn('truncate', compact && 'sr-only @3xl:not-sr-only')}>{label}</span>
            )}
          </Button>
        }
      />
      <Popover.Content className="w-64">
        <EntityPicker
          multiple
          items={tags.data?.data ?? []}
          itemKey={(tag) => ({ id: tag.id, label: tag.name })}
          value={tagIds}
          onValueChange={save}
          loading={tags.isPending}
          error={tags.error}
          searchPlaceholder={t('search-tags', 'Search tags')}
          renderCreate={(search, clear) => (
            <Button
              variant="ghost"
              className="w-full justify-start"
              disabled={create.isPending}
              onClick={() =>
                create.mutate(
                  { type: 'conversation', name: search },
                  {
                    onSuccess: (tag) => {
                      save([...tagIds, tag.id]);
                      clear();
                    },
                  },
                )
              }
            >
              <IconPlus />
              {t('create-tag', 'Create tag: {{name}}', { name: search })}
            </Button>
          )}
        />
      </Popover.Content>
    </Popover>
  );
};

/** Whether the inbox shows its conversation list beside the open one, on a wide screen. */
const listShown = stored({
  key: `${PLUGIN}:inbox-list`,
  schema: z.boolean(),
  initial: true,
});

/** The same on a narrow screen, for this visit only: hidden until the member asks for it. */
const narrowListShown = atom(false);

/**
 * Whether the conversation list shows beside the open conversation, and the switch for it. On a
 * screen too narrow for both at a working width (a tablet, a laptop's split window) the
 * conversation takes the room and the list waits behind the header's toggle; on a wide one the
 * member's last choice holds. While core's panel shows a customer or a teammate beside it, the
 * list gives up its room, so the thread and the reply box keep theirs; showing the list again
 * closes the panel.
 */
export const useListShown = () => {
  const wide = useMediaQuery('(min-width: 1024px)');
  const remembered = useAtom(listShown);
  const narrow = useAtom(narrowListShown);
  const [shown, setShown] = wide ? remembered : narrow;
  const record = useCurrentRecord();
  const { dismiss } = useOpenRecord();

  const show = (next: boolean) => {
    if (next && record) dismiss(record);
    setShown(next);
  };

  return [shown && !record, show] as const;
};

/** Hides the conversation list to give the open one the width, or shows it again. */
const ListToggle = () => {
  const { t } = useTranslation('frontline');
  const [shown, setShown] = useListShown();

  const label = shown
    ? t('hide-conversations', 'Hide conversations')
    : t('show-conversations', 'Show conversations');

  return (
    <IconTip label={label}>
      <Button
        variant="ghost"
        tone="muted"
        size="icon"
        aria-label={label}
        onClick={() => setShown(!shown)}
      >
        {shown ? <IconLayoutSidebarLeftCollapse /> : <IconLayoutSidebarLeftExpand />}
      </Button>
    </IconTip>
  );
};

/** How many tag names fit on the header's tag button before the rest count as +N. */
const TAGS_SHOWN = 2;

/**
 * The conversation's tags on its tag button, as the old inbox had them: each one's name after a
 * dot of its own colour, the first two named and the rest counted.
 */
const TagSummary = ({ conversation }: { conversation: Conversation }) => {
  const tags = usePickedTags(conversation.tagIds);
  const rest = tags.length - TAGS_SHOWN;

  return (
    <>
      {tags.slice(0, TAGS_SHOWN).map((tag) => (
        <span key={tag.id} className="flex min-w-0 items-center gap-1">
          <TagDot color={tag.colorCode} />
          <span className="truncate">{tag.name}</span>
        </span>
      ))}
      {rest > 0 && <span className="shrink-0 text-muted-foreground">+{rest}</span>}
    </>
  );
};

/**
 * The open conversation's top bar: on the left the list toggle, then who it is with, what state
 * it is in and where it came from; on the right what the member does with it (its assignee,
 * tickets and tags), then after a rule Resolve or Reopen and the overflow menu, so the step that
 * closes the work stands apart. Each change shows at once and saves behind it.
 */
export const ConversationHeader = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const assign = useAssign();
  const setStatus = useSetStatus();
  const resolved = conversation.status === 'resolved';

  return (
    <header className="@container flex h-14 shrink-0 items-center gap-2 border-b px-3">
      <ListToggle />
      <ConversationIdentity conversation={conversation} />
      <span className="flex-1" />
      <ReplyDue conversation={conversation} />
      <span className="flex shrink-0 items-center gap-1.5">
        <ConversationCall conversation={conversation} />
        <MemberButton
          value={conversation.assigneeId}
          onValueChange={(assigneeId) => assign.mutate({ ids: [conversation.id], assigneeId })}
          noneLabel={t('unassigned', 'Unassigned')}
          placeholder={t('assign', 'Assign')}
        />
        <ConversationTickets conversation={conversation} />
        <TagEditor
          compact
          ids={[conversation.id]}
          tagIds={conversation.tagIds}
          label={
            conversation.tagIds.length === 0
              ? t('add-tags', 'Add tags')
              : t('edit-tags', 'Edit tags')
          }
        >
          {conversation.tagIds.length > 0 ? <TagSummary conversation={conversation} /> : undefined}
        </TagEditor>
      </span>
      <Separator orientation="vertical" className="h-5" />
      {/* A narrow header keeps the icon, named on hover, so the customer and the assignee keep their names. */}
      <IconTip label={resolved ? t('reopen', 'Reopen') : t('resolve', 'Resolve')}>
        <Button
          variant={resolved ? 'outline' : 'default'}
          size="sm"
          disabled={setStatus.isPending}
          onClick={() =>
            setStatus.mutate({ ids: [conversation.id], status: resolved ? 'open' : 'resolved' })
          }
        >
          {resolved ? <IconRefresh /> : <IconCheck />}
          <span className="sr-only @xl:not-sr-only">
            {resolved ? t('reopen', 'Reopen') : t('resolve', 'Resolve')}
          </span>
        </Button>
      </IconTip>
      {(conversation.kind === 'messenger' || conversation.agentId) && (
        <ConversationMenu conversation={conversation} />
      )}
    </header>
  );
};
