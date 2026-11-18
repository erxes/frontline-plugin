import { memberQueries } from '@erxes/core-contract/client';
import { IconInbox, IconMail, IconMessages } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  Empty,
  ListFilter,
  PageContainer,
  PageHeader,
  RecordList,
  Resizable,
  Skeleton,
  stored,
  useOpenRecord,
  usePageHotkey,
  ViewBar,
} from 'erxes-ui';
import { useAtom, useAtomValue } from 'jotai';
import { type ReactNode, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { channelsQuery } from '~/shared/reference.ts';
import { CONVERSATION_TYPE, INTEGRATION_TYPE, PLUGIN } from '~/plugin.ts';
import { CreateButton, ListEmpty } from '~/shared/List.tsx';
import { BulkBar } from './BulkBar.tsx';
import { Composer } from './Composer.tsx';
import { ConversationHeader, listShown } from './ConversationHeader.tsx';
import { ConversationList } from './ConversationList.tsx';
import { CustomerSidebar } from './CustomerSidebar.tsx';
import { useInboxFields } from './InboxFilter.tsx';
import { MessageThread } from './MessageThread.tsx';
import {
  conversationTags,
  useConversation,
  useConversationSignal,
  useConversations,
  useIntegrations,
  useMessages,
  useOpenConversation,
} from './queries.ts';

const LIST = 'frontline-inbox';

/** The pane's shape while a conversation opened from the address loads: header, thread, reply box. */
const PaneSkeleton = () => (
  <div aria-hidden className="flex min-h-0 flex-1 flex-col">
    <div className="flex h-12 items-center gap-2 border-b px-3">
      <Skeleton radius="circle" className="size-6" />
      <Skeleton className="h-4 w-40" />
    </div>
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-3 py-6">
      <Skeleton className="h-12 w-2/5" />
      <Skeleton className="h-16 w-1/2 self-end" />
      <Skeleton className="h-10 w-1/3" />
    </div>
    <div className="mx-auto w-full max-w-2xl p-3">
      <Skeleton radius="lg" className="h-24" />
    </div>
  </div>
);

/**
 * The open conversation on the right, or a hint to pick one. Its messages load beside it, not
 * after it, and Escape closes it.
 */
const ConversationPane = () => {
  const { t } = useTranslation('frontline');
  const [id, setId] = useOpenConversation();
  const { data: conversation, error } = useConversation(id);

  useMessages(id);
  useConversationSignal(id);
  usePageHotkey('escape', () => void setId(null), { when: () => Boolean(id) });

  if (error) return <p className="m-4 text-sm text-destructive-text">{error.message}</p>;

  if (id && !conversation) return <PaneSkeleton />;

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

/** The narrowest the list goes: a row still shows the name, a few letters of the channel and the time. */
const LIST_MIN = 300;

/** The list's width in pixels, as the member last dragged it. */
const listWidth = stored({
  key: `${PLUGIN}:inbox-list-width`,
  schema: z.number().min(LIST_MIN),
  initial: 400,
});

/**
 * The list on the left and the open conversation on the right, with a handle between them that
 * drags the list wider or narrower; the width stays for the next visit. Pixels, not a share of
 * the page, so the list keeps its width when the window grows.
 */
const InboxColumns = ({ list, showList }: { list: ReactNode; showList: boolean }) => {
  const { t } = useTranslation('frontline');
  const [width, setWidth] = useAtom(listWidth);
  const dragged = useRef(width);

  return (
    <div className="flex min-h-0 flex-1">
      <Resizable.PanelGroup
        onLayoutChanged={(_, { isUserInteraction }) => {
          if (isUserInteraction) setWidth(dragged.current);
        }}
      >
        {showList && (
          <>
            <Resizable.Panel
              id="list"
              defaultSize={width}
              minSize={LIST_MIN}
              maxSize="50%"
              onResize={({ inPixels }) => {
                dragged.current = Math.round(inPixels);
              }}
            >
              <aside className="flex h-full flex-col">{list}</aside>
            </Resizable.Panel>
            <Resizable.Handle aria-label={t('resize-list', 'Resize the conversation list')} />
          </>
        )}
        <Resizable.Panel id="conversation" minSize={360}>
          <section
            aria-label={t('conversation', 'Conversation')}
            className="flex h-full min-w-0 flex-col"
          >
            <ConversationPane />
          </section>
        </Resizable.Panel>
      </Resizable.PanelGroup>
    </div>
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
  const channels = useQuery(channelsQuery).data?.channels ?? [];
  const canConnect = channels.some((channel) => channel.canManage);
  const connect = () => openNew(INTEGRATION_TYPE);

  const mails = (useIntegrations().data ?? []).some(
    (integration) => integration.kind === 'mail' && integration.isActive,
  );

  const [openId] = useOpenConversation();

  // The header's toggle hides the list beside an open conversation only.
  const shown = useAtomValue(listShown);

  const list = useConversations();
  const { rows: conversations, isPending } = list;

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
          {mails && (
            <Button variant="outline" onClick={() => openNew(CONVERSATION_TYPE)}>
              <IconMail />
              {t('new-mail', 'New mail')}
            </Button>
          )}
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
          totalCount={list.totalCount}
        />
      </ViewBar>
      {list.error ? (
        <p className="m-3 text-sm text-destructive-text">{list.error.message}</p>
      ) : empty && !openId ? (
        <InboxEmpty onConnect={canConnect ? connect : undefined} />
      ) : (
        <InboxColumns
          showList={shown || !openId}
          list={
            empty ? (
              <InboxEmpty onConnect={canConnect ? connect : undefined} />
            ) : (
              <RecordList.Provider listId={LIST}>
                <ConversationList
                  conversations={conversations}
                  customers={list.customers}
                  paging={list}
                  refresh={() => void list.refetch()}
                />
                <BulkBar conversations={conversations} />
              </RecordList.Provider>
            )
          }
        />
      )}
    </PageContainer>
  );
};
