import { contactQueries, memberQueries } from '@erxes/core-contract/client';
import { IconCheck, IconPlus, IconRefresh, IconTag } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, ContactLink, EntityPicker, Popover, SelectMember } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { OperatorButton, VisitorPresence } from './ConversationPresence.tsx';
import { useKindNames, useStatusNames } from './InboxFilter.tsx';
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
          <Button variant="ghost" size="sm">
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

/** The conversation's tags, as badges under the header's controls. */
const useTags = (conversation: Conversation) =>
  (useQuery(conversationTags).data?.data ?? []).filter((tag) =>
    conversation.tagIds.includes(tag.id),
  );

/**
 * The open conversation's controls in the old inbox's order: who it is with, through what, and
 * its assignee on the left; tags and Resolve or Reopen on the right, the tags themselves under
 * them. Each change saves at once.
 */
export const ConversationHeader = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const assign = useAssign();
  const setStatus = useSetStatus();
  const statuses = useStatusNames();
  const kinds = useKindNames();
  const resolved = conversation.status === 'resolved';
  const tags = useTags(conversation);

  return (
    <header className="flex flex-col gap-2 border-b px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <ContactLink
          contentType="core:customer"
          contentId={conversation.customerId}
          contacts={contactQueries}
          placeholder={t('visitor', 'Visitor')}
        />
        <Badge variant="muted">{kinds[conversation.kind] ?? conversation.kind}</Badge>
        <Badge variant={conversation.status === 'new' ? 'info' : 'secondary'}>
          {statuses[conversation.status]}
        </Badge>
        <SelectMember.Field
          value={conversation.assigneeId}
          onValueChange={(assigneeId) => assign.mutate({ ids: [conversation.id], assigneeId })}
          members={memberQueries}
          noneLabel={t('unassigned', 'Unassigned')}
          placeholder={t('assign', 'Assign')}
          className="w-48"
        />
        <span className="flex-1" />
        {conversation.kind === 'messenger' && <OperatorButton conversation={conversation} />}
        <TagEditor
          ids={[conversation.id]}
          tagIds={conversation.tagIds}
          label={tags.length === 0 ? t('add-tags', 'Add tags') : t('edit-tags', 'Edit tags')}
        />
        <Button
          variant={resolved ? 'outline' : 'default'}
          disabled={setStatus.isPending}
          onClick={() =>
            setStatus.mutate({ ids: [conversation.id], status: resolved ? 'open' : 'resolved' })
          }
        >
          {resolved ? <IconRefresh /> : <IconCheck />}
          {resolved ? t('reopen', 'Reopen') : t('resolve', 'Resolve')}
        </Button>
      </div>
      <VisitorPresence conversation={conversation} />
      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {tags.map((tag) => (
            <Badge key={tag.id} variant="secondary">
              {tag.name}
            </Badge>
          ))}
        </div>
      )}
    </header>
  );
};
