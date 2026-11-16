import { contactQueries, memberQueries } from '@erxes/core-contract/client';
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
  Badge,
  Button,
  ContactLink,
  EntityPicker,
  IconTip,
  Popover,
  SelectMember,
  stored,
} from 'erxes-ui';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { PLUGIN } from '~/plugin.ts';
import { ConversationMenu, VisitorTyping } from './ConversationPresence.tsx';
import { KindIcon } from './InboxFilter.tsx';
import {
  type Conversation,
  conversationTags,
  useAssign,
  useCreateTag,
  useSetStatus,
  useSetTags,
} from './queries.ts';

/**
 * A button that opens the conversation tags, `tagIds` picked, and sets them on each of `ids`;
 * the search makes a new one.
 */
export const TagEditor = ({
  ids,
  tagIds,
  label,
}: {
  ids: string[];
  tagIds: string[];
  label: string;
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
          <Button variant="outline" size="sm">
            <IconTag />
            {label}
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

/** The conversation's tags, as badges beside Edit tags. */
const useTags = (conversation: Conversation) =>
  (useQuery(conversationTags).data?.data ?? []).filter((tag) =>
    conversation.tagIds.includes(tag.id),
  );

/**
 * The open conversation's controls on one row, as the old inbox had them: the list toggle, who
 * it is with and its assignee on the left; its tags, Resolve or Reopen and the overflow menu on
 * the right. Each change saves at once.
 */
export const ConversationHeader = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const assign = useAssign();
  const setStatus = useSetStatus();
  const resolved = conversation.status === 'resolved';
  const tags = useTags(conversation);

  return (
    <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
      <ListToggle />
      <ContactLink
        contentType="core:customer"
        contentId={conversation.customerId}
        contacts={contactQueries}
        placeholder={t('visitor', 'Visitor')}
      />
      <span className="hidden items-center gap-1 truncate text-xs text-muted-foreground xl:flex">
        <KindIcon kind={conversation.kind} className="size-3.5 shrink-0" />
        {conversation.integrationName}
      </span>
      <VisitorTyping conversation={conversation} />
      <SelectMember.Linked
        value={conversation.assigneeId}
        onValueChange={(assigneeId) => assign.mutate({ ids: [conversation.id], assigneeId })}
        members={memberQueries}
        noneLabel={t('unassigned', 'Unassigned')}
        addLabel={t('assign', 'Assign')}
        changeLabel={t('change-assignee', 'Change assignee')}
      />
      <span className="flex min-w-0 flex-1 justify-end gap-1 overflow-hidden">
        {tags.map((tag) => (
          <Badge key={tag.id} variant="secondary">
            {tag.name}
          </Badge>
        ))}
      </span>
      <TagEditor
        ids={[conversation.id]}
        tagIds={conversation.tagIds}
        label={tags.length === 0 ? t('add-tags', 'Add tags') : t('edit-tags', 'Edit tags')}
      />
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
