import { memberQueries } from '@erxes/core-contract/client';
import { IconInbox, IconMessages } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Empty,
  ListFilter,
  PageContainer,
  PageHeader,
  RecordList,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { INTEGRATION_TYPE } from '~/plugin.ts';
import { CreateButton, ListEmpty } from '~/shared/List.tsx';
import { BulkBar } from './BulkBar.tsx';
import { Composer } from './Composer.tsx';
import { ConversationHeader } from './ConversationHeader.tsx';
import { ConversationList } from './ConversationList.tsx';
import { CustomerSidebar } from './CustomerSidebar.tsx';
import { useInboxFields } from './InboxFilter.tsx';
import { MessageThread } from './MessageThread.tsx';
import {
  conversationTags,
  useConversation,
  useConversations,
  useOpenConversation,
} from './queries.ts';

const LIST = 'frontline-inbox';

/** The open conversation on the right, or a hint to pick one. */
const ConversationPane = () => {
  const { t } = useTranslation('frontline');
  const [id] = useOpenConversation();
  const { data: conversation, error } = useConversation(id);

  if (error) return <p className="m-4 text-sm text-destructive-text">{error.message}</p>;

  if (!conversation)
    return (
      <Empty className="m-auto">
        <Empty.Header>
          <Empty.Media>
            <IconMessages />
          </Empty.Media>
          <Empty.Title>{t('pick-conversation', 'Pick a conversation')}</Empty.Title>
          <Empty.Description>
            {t('pick-conversation-description', 'Its messages and reply box show here.')}
          </Empty.Description>
        </Empty.Header>
      </Empty>
    );

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <ConversationHeader conversation={conversation} />
        <MessageThread conversation={conversation} />
        <Composer key={conversation.id} conversation={conversation} />
      </div>
      <CustomerSidebar conversation={conversation} />
    </div>
  );
};

/** No conversation yet, or none the filters match; a channel admin can add a messenger. */
const InboxEmpty = ({ onConnect }: { onConnect?: () => void }) => {
  const { t } = useTranslation('frontline');

  return (
    <ListEmpty
      icon={<IconInbox />}
      title={t('no-conversations-yet', 'No conversations yet')}
      description={t(
        'no-conversations-description',
        'Conversations from your channels’ messengers and integrations land here.',
      )}
      action={
        onConnect && <Button onClick={onConnect}>{t('add-messenger', 'Add messenger')}</Button>
      }
    />
  );
};

/**
 * The inbox: every conversation of the member's channels under core's list bar, on the left,
 * filtered by channel, integration, status, assignee, tags and more, and the open one on the
 * right with its thread and reply box. A channel admin adds a website messenger from here.
 */
export const InboxPage = () => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const channels = useQuery(orpc.channels.list.queryOptions({ input: {} })).data?.channels ?? [];
  const canConnect = channels.some((channel) => channel.canManage);
  const connect = () => openNew(INTEGRATION_TYPE);

  const [openId] = useOpenConversation();

  const { conversations, totalCount, isPending, error, hasNextPage, fetchNextPage } =
    useConversations();

  // A conversation the filters no longer match stays open beside the empty list.
  const empty = !isPending && conversations.length === 0;

  return (
    <PageContainer>
      <PageHeader>
        <PageHeader.Start>
          <span className="flex h-8 items-center gap-1.5 px-3 text-sm font-medium">
            <IconInbox />
            {t('inbox', 'Inbox')}
          </span>
        </PageHeader.Start>
        <PageHeader.End>
          <CreateButton
            allowed={canConnect}
            label={t('add-messenger', 'Add messenger')}
            onClick={connect}
          />
        </PageHeader.End>
      </PageHeader>
      <ViewBar allLabel={t('all-conversations', 'All conversations')}>
        <ListFilter
          id={LIST}
          fields={useInboxFields()}
          members={memberQueries}
          tags={conversationTags}
          totalCount={totalCount}
        />
      </ViewBar>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : empty && !openId ? (
        <InboxEmpty onConnect={canConnect ? connect : undefined} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <aside className="w-80 shrink-0 border-r">
            {empty ? (
              <InboxEmpty onConnect={canConnect ? connect : undefined} />
            ) : (
              <RecordList.Provider listId={LIST}>
                <ConversationList
                  conversations={conversations}
                  isPending={isPending}
                  hasNextPage={hasNextPage}
                  fetchNextPage={() => void fetchNextPage()}
                />
                <BulkBar conversations={conversations} />
              </RecordList.Provider>
            )}
          </aside>
          <section
            aria-label={t('conversation', 'Conversation')}
            className="flex min-w-0 flex-1 flex-col"
          >
            <ConversationPane />
          </section>
        </div>
      )}
    </PageContainer>
  );
};
