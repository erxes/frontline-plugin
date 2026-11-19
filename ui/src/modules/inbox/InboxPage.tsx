import { memberQueries } from '@erxes/core-contract/client';
import { IconInbox, IconMail, IconMessages } from '@tabler/icons-react';
import { usePrefetchInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  Button,
  Empty,
  ListFilter,
  PageContainer,
  RecordList,
  Resizable,
  Skeleton,
  stored,
  useOpenRecord,
  usePageHotkey,
  ViewBar,
} from 'erxes-ui';
import { useAtom, useAtomValue } from 'jotai';
import { type ReactNode, useEffect, useRef, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { channelsQuery } from '~/shared/reference.ts';
import { CONVERSATION_TYPE, INTEGRATION_TYPE, PLUGIN } from '~/plugin.ts';
import { AppHeader } from '~/shared/Header.tsx';
import { CreateButton, ListEmpty } from '~/shared/List.tsx';
import { useListParams } from '~/shared/listPath.ts';
import { QueryBoundary } from '~/shared/QueryBoundary.tsx';
import { BulkBar } from './BulkBar.tsx';
import { sendingTo, useMarkRead, useSendMessage } from './changes.ts';
import { Composer } from './Composer.tsx';
import { ConversationHeader, listShown } from './ConversationHeader.tsx';
import { ConversationList, RowSkeletons } from './ConversationList.tsx';
import { CustomerSidebar } from './CustomerSidebar.tsx';
import { useInboxFields } from './InboxFilter.tsx';
import { MessageThread, ThreadSkeleton } from './MessageThread.tsx';
import {
  type Conversation,
  conversationTags,
  messagesOptions,
  useConversationCount,
  useConversationSignal,
  useConversations,
  useIntegrations,
  useOpenConversation,
  useOpenedConversation,
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

const onVisibility = (change: () => void) => {
  document.addEventListener('visibilitychange', change);

  return () => document.removeEventListener('visibilitychange', change);
};

/**
 * Reads the open conversation while the member can see it: once it opens, from the list, the
 * keys or a link, and again as each new message arrives in it. In a tab left in the background
 * it stays unread until the member comes back. Each message is read once while the conversation
 * stays open, so a refused read doesn't retry in a loop; closing it and opening it again does.
 */
const useReadWhileOpen = (conversation: Conversation) => {
  const { mutate } = useMarkRead();
  const visible = useSyncExternalStore(onVisibility, () => document.visibilityState === 'visible');
  const read = useRef('');
  const id = conversation.isRead ? '' : conversation.id;
  const lastAt = conversation.lastMessageAt.getTime();

  useEffect(() => {
    const message = `${id}@${lastAt}`;

    if (!id) read.current = '';

    if (!id || !visible || read.current === message) return;

    read.current = message;
    mutate({ id });
  }, [id, lastAt, visible, mutate]);
};

/** The pane before a conversation is picked. */
const PickConversation = () => {
  const { t } = useTranslation('frontline');

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
};

/**
 * The open conversation: its header, thread and reply box, and its customer beside them. Its
 * messages load beside it, not after it. The thread waits and fails on its own, so a refused
 * thread keeps the header and reply box; picking another conversation keeps this one up until
 * the next one's messages are in.
 */
const OpenConversation = ({ id }: { id: string }) => {
  usePrefetchInfiniteQuery(messagesOptions(id));

  const conversation = useOpenedConversation(id);
  // One send for the composer and the thread, which shows it while it goes.
  const send = useSendMessage();

  useConversationSignal(id);
  useReadWhileOpen(conversation);

  // Another conversation gets a new thread and composer, with nothing carried over.
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <ConversationHeader conversation={conversation} />
        <QueryBoundary
          resetKeys={[id]}
          fallback={<ThreadSkeleton />}
          renderError={(message) => (
            <p role="alert" className="flex-1 p-6 text-center text-sm text-destructive-text">
              {message}
            </p>
          )}
        >
          <MessageThread key={id} conversation={conversation} sending={sendingTo(send, id)} />
        </QueryBoundary>
        <Composer key={id} conversation={conversation} send={send} />
      </div>
      <CustomerSidebar conversation={conversation} />
    </div>
  );
};

/** The open conversation on the right, or a hint to pick one; Escape closes it. */
const ConversationPane = () => {
  const [id, setId] = useOpenConversation();

  usePageHotkey('escape', () => void setId(null), { when: () => Boolean(id) });

  return (
    <QueryBoundary
      resetKeys={[id]}
      fallback={<PaneSkeleton />}
      renderError={(message) => <p className="m-4 text-sm text-destructive-text">{message}</p>}
    >
      {id ? <OpenConversation id={id} /> : <PickConversation />}
    </QueryBoundary>
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
const InboxColumns = ({
  list,
  pane,
  showList,
}: {
  list: ReactNode;
  pane: ReactNode;
  showList: boolean;
}) => {
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
            {pane}
          </section>
        </Resizable.Panel>
      </Resizable.PanelGroup>
    </div>
  );
};

/** The list's and pane's shape while the first page of conversations loads. */
const InboxSkeleton = () => {
  const [openId] = useOpenConversation();

  return <InboxColumns showList list={<RowSkeletons />} pane={openId ? <PaneSkeleton /> : null} />;
};

/**
 * The conversations on the left and the open one on the right, or the empty inbox. It suspends
 * until the first page is in, and a new filter keeps the old rows up until the new ones are.
 */
const InboxBody = ({ onConnect }: { onConnect?: () => void }) => {
  const [openId] = useOpenConversation();
  // The header's toggle hides the list beside an open conversation only.
  const shown = useAtomValue(listShown);
  const list = useConversations();
  const { rows: conversations } = list;
  // A conversation the filters no longer match stays open beside the empty list.
  const empty = conversations.length === 0;
  // Another filter is another list, so what was picked in the last one goes.
  const filter = JSON.stringify(useListParams());

  if (empty && !openId) return <InboxEmpty onConnect={onConnect} />;

  return (
    <InboxColumns
      showList={shown || !openId}
      pane={<ConversationPane />}
      list={
        empty ? (
          <InboxEmpty onConnect={onConnect} />
        ) : (
          <RecordList.Provider key={filter} listId={LIST}>
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

  return (
    <PageContainer>
      <AppHeader icon={IconInbox} app={{ label: t('inbox', 'Inbox') }}>
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
      </AppHeader>
      <ViewBar allLabel={t('all-conversations', 'All conversations')}>
        <ListFilter
          id={LIST}
          fields={useInboxFields()}
          members={memberQueries}
          tags={conversationTags}
          totalCount={useConversationCount()}
        />
      </ViewBar>
      {/* A later page that fails keeps the rows already shown, and its button to try again. */}
      <QueryBoundary
        fallback={<InboxSkeleton />}
        renderError={(message) => <p className="m-3 text-sm text-destructive-text">{message}</p>}
      >
        <InboxBody onConnect={canConnect ? connect : undefined} />
      </QueryBoundary>
    </PageContainer>
  );
};
