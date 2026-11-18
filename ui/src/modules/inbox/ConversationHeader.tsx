import {
  IconCheck,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconLayoutSidebarRightExpand,
  IconPlus,
  IconRefresh,
  IconTag,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, EntityPicker, IconTip, Popover, stored, useOpenRecord } from 'erxes-ui';
import { useAtom } from 'jotai';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { CONVERSATION_TYPE, PLUGIN } from '~/plugin.ts';
import { MemberCell } from '~/shared/MemberPicker.tsx';
import { ContactChip } from '~/shared/Person.tsx';
import { ConversationMenu, VisitorTyping } from './ConversationPresence.tsx';
import { KindIcon } from '~/shared/kinds.tsx';
import { type Conversation, conversationTags, useCreateTag } from './queries.ts';
import { useAssign, useSetStatus, useSetTags } from './changes.ts';

/**
 * A button named `label` that opens the conversation tags, `tagIds` picked, and sets them on each
 * of `ids`; the search makes a new one. `children` shows on the button in place of the label.
 */
export const TagEditor = ({
  ids,
  tagIds,
  label,
  children,
}: {
  ids: string[];
  tagIds: string[];
  label: string;
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
                {children}
              </>
            ) : (
              label
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

/** Whether the inbox shows its conversation list beside the open one. */
export const listShown = stored({
  key: `${PLUGIN}:inbox-list`,
  schema: z.boolean(),
  initial: true,
});

/** Hides the conversation list to give the open one the width, or shows it again. */
const ListToggle = () => {
  const { t } = useTranslation('frontline');
  const [shown, setShown] = useAtom(listShown);

  const label = shown
    ? t('hide-conversations', 'Hide conversations')
    : t('show-conversations', 'Show conversations');

  return (
    <IconTip label={label}>
      <Button variant="ghost" size="icon" aria-label={label} onClick={() => setShown(!shown)}>
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
  const tags = (useQuery(conversationTags).data?.data ?? []).filter((tag) =>
    conversation.tagIds.includes(tag.id),
  );

  const rest = tags.length - TAGS_SHOWN;

  return (
    <>
      {tags.slice(0, TAGS_SHOWN).map((tag) => {
        const dot: Record<`--${string}`, string> = { '--tag-color': tag.colorCode ?? '' };

        return (
          <span key={tag.id} className="flex min-w-0 items-center gap-1">
            {tag.colorCode && (
              <span
                aria-hidden
                style={dot}
                className="size-2 shrink-0 rounded-full bg-(--tag-color)"
              />
            )}
            <span className="truncate">{tag.name}</span>
          </span>
        );
      })}
      {rest > 0 && <span className="shrink-0 text-muted-foreground">+{rest}</span>}
    </>
  );
};

/**
 * The open conversation's controls on one row, as the old inbox had them: the list toggle, who
 * it is with, where it came from and its assignee on the left; its tags, Resolve or Reopen and
 * the overflow menu on the right. Each change shows at once and saves behind it.
 */
export const ConversationHeader = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const assign = useAssign();
  const setStatus = useSetStatus();
  const resolved = conversation.status === 'resolved';
  const { open } = useOpenRecord();

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <ListToggle />
      <span className="flex min-w-0">
        <ContactChip contentId={conversation.customerId} placeholder={t('visitor', 'Visitor')} />
      </span>
      <IconTip label={`${conversation.channelName} · ${conversation.integrationName}`}>
        <span className="grid size-6 shrink-0 place-items-center">
          <KindIcon kind={conversation.kind} className="size-4" />
          <span className="sr-only">{conversation.channelName}</span>
        </span>
      </IconTip>
      <VisitorTyping conversation={conversation} />
      <MemberCell
        variant="field"
        value={conversation.assigneeId}
        onValueChange={(assigneeId) => assign.mutate({ ids: [conversation.id], assigneeId })}
        noneLabel={t('unassigned', 'Unassigned')}
        placeholder={t('assign', 'Assign')}
        aria-label={conversation.assigneeId ? undefined : t('assign', 'Assign')}
        className="w-auto min-w-0"
      />
      <span className="flex-1" />
      <TagEditor
        ids={[conversation.id]}
        tagIds={conversation.tagIds}
        label={
          conversation.tagIds.length === 0 ? t('add-tags', 'Add tags') : t('edit-tags', 'Edit tags')
        }
      >
        {conversation.tagIds.length > 0 ? <TagSummary conversation={conversation} /> : undefined}
      </TagEditor>
      <IconTip label={t('conversation-details', 'Details and properties')}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('conversation-details', 'Details and properties')}
          onClick={() => open({ contentType: CONVERSATION_TYPE, contentId: conversation.id })}
        >
          <IconLayoutSidebarRightExpand />
        </Button>
      </IconTip>
      <Button
        variant="outline"
        size="sm"
        disabled={setStatus.isPending}
        onClick={() =>
          setStatus.mutate({ ids: [conversation.id], status: resolved ? 'open' : 'resolved' })
        }
      >
        {resolved ? <IconRefresh /> : <IconCheck />}
        {resolved ? t('reopen', 'Reopen') : t('resolve', 'Resolve')}
      </Button>
      {conversation.kind === 'messenger' && <ConversationMenu conversation={conversation} />}
    </header>
  );
};
