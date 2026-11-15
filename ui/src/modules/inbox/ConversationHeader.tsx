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

/** The conversation's tags as badges, and a picker that sets them or makes a new one. */
const TagPicker = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const tags = useQuery(conversationTags);
  const setTags = useSetTags();
  const create = useCreateTag();
  const all = tags.data?.data ?? [];
  const picked = all.filter((tag) => conversation.tagIds.includes(tag.id));
  const save = (tagIds: string[]) => setTags.mutate({ id: conversation.id, tagIds });

  return (
    <div className="flex flex-wrap items-center gap-1">
      {picked.map((tag) => (
        <Badge key={tag.id} variant="secondary">
          {tag.name}
        </Badge>
      ))}
      <Popover>
        <Popover.Trigger
          render={
            <Button variant="ghost" size="sm">
              <IconTag />
              {picked.length === 0 ? t('add-tags', 'Add tags') : t('edit-tags', 'Edit tags')}
            </Button>
          }
        />
        <Popover.Content className="w-64">
          <EntityPicker
            multiple
            items={all}
            itemKey={(tag) => ({ id: tag.id, label: tag.name })}
            value={conversation.tagIds}
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
                        save([...conversation.tagIds, tag.id]);
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
    </div>
  );
};

/**
 * Who the open conversation is with and through what, its assignee, its tags, and Resolve or
 * Reopen. Each change saves at once.
 */
export const ConversationHeader = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const assign = useAssign();
  const setStatus = useSetStatus();
  const statuses = useStatusNames();
  const kinds = useKindNames();
  const resolved = conversation.status === 'resolved';

  return (
    <header className="flex flex-col gap-2 border-b px-4 py-3">
      <div className="flex items-center gap-2">
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
        <span className="flex-1" />
        {conversation.kind === 'messenger' && <OperatorButton conversation={conversation} />}
        <SelectMember.Field
          value={conversation.assigneeId}
          onValueChange={(assigneeId) => assign.mutate({ ids: [conversation.id], assigneeId })}
          members={memberQueries}
          noneLabel={t('unassigned', 'Unassigned')}
          placeholder={t('assign', 'Assign')}
          className="w-48"
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
      <TagPicker conversation={conversation} />
    </header>
  );
};
