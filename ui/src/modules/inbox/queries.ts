import { contactQueries, orpc as core } from '@erxes/core-contract/client';
import type { InferClientOutputs } from '@orpc/client';
import {
  hashKey,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  useSuspenseInfiniteQuery,
  useSuspenseQuery,
} from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useLiveSignal } from 'erxes-ui';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useRef, useState } from 'react';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { useChange } from '~/shared/hooks.ts';
import { type FilterParams, listParamsOf, useListParams } from '~/shared/listPath.ts';
import { type PageParam, pageOptions, usePaged } from '~/shared/paging.ts';
import {
  channelsQuery,
  FRESH_MS,
  integrationsQuery,
  REFERENCE_MS,
  tagsOf,
  templatesQuery,
} from '~/shared/reference.ts';

type Outputs = InferClientOutputs<Client>;

export type Conversation = Outputs['conversations']['get'];

/** One run of a conversation's core agent, with its API calls. */
export type AgentRun = Outputs['conversations']['agentRuns']['runs'][number];

export type Message = Outputs['conversations']['messages']['list']['messages'][number];

export type Integration = Outputs['integrations']['get'];

export type ListPage = Outputs['conversations']['list'];

export type MessagePages = InfiniteData<Outputs['conversations']['messages']['list'], PageParam>;

export type Counts = Outputs['conversations']['counts'];

/** The open conversation, in the address as the old inbox kept it. */
export const useOpenConversation = () =>
  useQueryState('conversationId', parseAsString.withDefault(''));

/** How long the inbox gathers changes before it refetches once. */
const REFRESH_MS = 1000;

/** What any conversation's change shows in: the lists and the sidebar's counts. */
const LISTED = [orpc.conversations.list.key(), orpc.conversations.counts.key()];

/** What one conversation's change shows in: its row and its messages, pinned ones too. */
const conversationKeys = (id: string) => [
  orpc.conversations.get.key({ input: { id } }),
  orpc.conversations.messages.list.key({ input: { conversationId: id } }),
];

/** The member's own change: the lists, and every conversation, since one of them changed. */
const CHANGED = [...LISTED, orpc.conversations.get.key(), orpc.conversations.messages.list.key()];

/** The keys each query client waits to refetch, by hash, until its gathering second ends. */
const gathering = new WeakMap<QueryClient, Map<string, QueryKey>>();

/** Starts a client's gathering second; at its end, what gathered refetches. */
const gather = (queryClient: QueryClient) => {
  const due = new Map<string, QueryKey>();

  gathering.set(queryClient, due);
  setTimeout(() => {
    gathering.delete(queryClient);

    for (const queryKey of due.values()) void queryClient.invalidateQueries({ queryKey });
  }, REFRESH_MS);

  return due;
};

/**
 * Refetches the queries under `keys`, gathered for a second: a burst of live signals, and the
 * member's own changes with them, become one refetch at its end. Only the queries on screen
 * refetch; the rest wait until they show again.
 */
const refresh = (queryClient: QueryClient, keys: QueryKey[]) => {
  const due = gathering.get(queryClient) ?? gather(queryClient);

  for (const key of keys) due.set(hashKey(key), key);
};

/** Refetches what the member's own change to a conversation shows in. */
export const refreshInbox = (queryClient: QueryClient) => refresh(queryClient, CHANGED);

/**
 * Keeps the inbox's lists and counts live as another member, a visitor or a provider changes a
 * conversation. The layout calls it once, for every page under it.
 */
export const useInboxSignal = () => {
  const queryClient = useQueryClient();

  useLiveSignal(PLUGIN, 'conversations', () => refresh(queryClient, LISTED));
};

/**
 * Keeps one open conversation live: its own topic says it changed, so a change to another
 * conversation leaves it alone. Nothing while no conversation is open.
 */
export const useConversationSignal = (id: string) => {
  const queryClient = useQueryClient();

  useLiveSignal(PLUGIN, id ? [`conversation.${id.toLowerCase()}`] : [], () =>
    refresh(queryClient, conversationKeys(id)),
  );
};

/** How long a customer core sent counts as fresh, as core's own customer queries keep them. */
const CUSTOMER_MS = 60_000;

/**
 * The customers of one page's conversations, in one request. Each lands where a customer's own
 * query reads it, so the open conversation's thread and sidebar ask for none.
 */
const pageCustomersOptions = (queryClient: QueryClient, page: ListPage) => {
  const ids = [...new Set(page.conversations.map((row) => row.customerId))].toSorted();

  return queryOptions({
    queryKey: [PLUGIN, 'page-customers', ids],
    queryFn: async () => {
      const { data } = await core.customers.list.call({ ids: ids.join(','), limit: ids.length });

      for (const customer of data)
        queryClient.setQueryData(contactQueries.customer(customer.id).queryKey, customer);

      return data;
    },
    enabled: ids.length > 0,
    staleTime: CUSTOMER_MS,
  });
};

/** The customers of the list's conversations by id, one request a page. */
const usePageCustomers = (pages: ListPage[]) => {
  const queryClient = useQueryClient();

  return useQueries({
    queries: pages.map((page) => pageCustomersOptions(queryClient, page)),
    combine: (results) =>
      new Map(results.flatMap((result) => result.data ?? []).map((row) => [row.id, row])),
  });
};

/** The conversations under the filter bar's `params`, latest message first, a page at a time. */
const conversationsOptions = (params: FilterParams) =>
  orpc.conversations.list.infiniteOptions({
    input: ({ cursor }: PageParam) => ({ ...params, cursor }),
    ...pageOptions,
    staleTime: FRESH_MS,
  });

const rowsOf = (page: ListPage) => page.conversations;

/**
 * The conversations the filter bar keeps, a page at a time, and their customers by id. It
 * suspends until the first page is in; a new filter keeps the old rows until the new ones are.
 */
export const useConversations = () => {
  const query = usePaged(useSuspenseInfiniteQuery(conversationsOptions(useListParams())), rowsOf);

  return { ...query, customers: usePageCustomers(query.data.pages) };
};

/**
 * Takes the list back to its first page, as it opened: a long scroll dropped the newest pages,
 * and paging back up to them one page at a time is slow.
 */
export const useRewindConversations = () => {
  const queryClient = useQueryClient();
  const { queryKey } = conversationsOptions(useListParams());

  return () => queryClient.resetQueries({ queryKey });
};

/**
 * How many conversations match the filter bar, for its count: read from the query the list
 * suspends on, without asking it again.
 */
export const useConversationCount = () =>
  usePaged(useInfiniteQuery({ ...conversationsOptions(useListParams()), enabled: false }), rowsOf)
    .totalCount;

/**
 * Loads the inbox at `to` before it opens: the first page of its conversations and their
 * customers, and the channels and integrations its header reads.
 */
export const prefetchInbox = async (queryClient: QueryClient, to: string) => {
  const [list] = await Promise.all([
    queryClient.infiniteQuery(conversationsOptions(listParamsOf(to).params)),
    queryClient.query(channelsQuery),
    queryClient.query(integrationsQuery),
  ]);

  const page = list.pages[0];

  if (page?.conversations.length) await queryClient.query(pageCustomersOptions(queryClient, page));
};

export const LISTS = orpc.conversations.list.key({ type: 'infinite' });

/** A conversation's row in a list the cache holds, and when that list loaded. */
export const listedRow = (queryClient: QueryClient, id: string) => {
  for (const [queryKey, data] of queryClient.getQueriesData<InfiniteData<ListPage>>({
    queryKey: LISTS,
  })) {
    const row = data?.pages.flatMap((page) => page.conversations).find((item) => item.id === id);

    if (row) return { row, updatedAt: queryClient.getQueryState(queryKey)?.dataUpdatedAt };
  }

  return undefined;
};

export const conversationOptions = (id: string) =>
  orpc.conversations.get.queryOptions({ input: { id }, staleTime: FRESH_MS });

/**
 * One conversation's options. A conversation picked from the list shows at once from the list's
 * row, and asks the API only once that row is older than the inbox's fresh time.
 */
const listedConversation = (queryClient: QueryClient, id: string) => ({
  ...conversationOptions(id),
  initialData: () => listedRow(queryClient, id)?.row,
  initialDataUpdatedAt: () => listedRow(queryClient, id)?.updatedAt,
});

/** One conversation, nothing while `id` is empty. */
export const useConversation = (id: string) =>
  useQuery({ ...listedConversation(useQueryClient(), id), enabled: Boolean(id) });

/**
 * The open conversation; it suspends only when the list doesn't hold it. A refetch that fails
 * keeps the data it had beside its error.
 */
export const useOpenedConversation = (id: string) =>
  useSuspenseQuery(listedConversation(useQueryClient(), id));

/** How often a thread with a reply on its way reads it again, so a send that never settles fails. */
const PENDING_MS = 60_000;

export const messagesOptions = (conversationId: string) =>
  orpc.conversations.messages.list.infiniteOptions({
    input: ({ cursor }: PageParam) => ({ conversationId, cursor }),
    ...pageOptions,
    staleTime: FRESH_MS,
    refetchInterval: (query) =>
      threadOf(query.state.data).some(
        ({ deliveryStatus }) => deliveryStatus === 'queued' || deliveryStatus === 'sending',
      ) && PENDING_MS,
  });

const pinnedOptions = (conversationId: string) =>
  orpc.conversations.messages.list.queryOptions({
    input: { conversationId, pinned: true },
    staleTime: FRESH_MS,
  });

/**
 * Loads what a conversation opens with before it opens, as the pointer rests on its row or the
 * keys move to it: its messages, pinned ones and its channel's response templates.
 */
export const prefetchConversation = (queryClient: QueryClient, conversation: Conversation) =>
  Promise.all([
    queryClient.infiniteQuery(messagesOptions(conversation.id)),
    queryClient.query(pinnedOptions(conversation.id)),
    queryClient.query(templatesQuery(conversation.channelId)),
  ]);

/** The loaded pages of a thread, oldest message first. */
export const threadOf = (data: { pages: { messages: Message[] }[] } | undefined) =>
  (data?.pages.flatMap((page) => page.messages) ?? []).toReversed();

/**
 * A conversation's messages, oldest first for reading; it suspends until the latest page is in.
 * The older ones load a page at a time as next pages, the newer ones as previous pages once a
 * long read back dropped them.
 */
export const useMessages = (conversationId: string) => {
  const query = useSuspenseInfiniteQuery(messagesOptions(conversationId));

  return { ...query, messages: threadOf(query.data) };
};

export const usePinnedMessages = (conversationId: string) =>
  useQuery(pinnedOptions(conversationId));

/**
 * Cards for the web links in a message's text; only one with a link asks, once. Editing the
 * message refetches them.
 */
export const useLinkPreviews = (message: Message) =>
  useQuery({
    ...orpc.conversations.messages.linkPreviews.queryOptions({ input: { id: message.id } }),
    enabled: /https?:\/\//.test(message.content),
    staleTime: Infinity,
  });

/**
 * How many conversations wait unread by the member: in all, in each sidebar queue and in each of
 * their channels, kept live by the layout's signal. A refusal isn't asked again, so a member
 * without the inbox sees no outline wait on it.
 */
export const useInboxCounts = () =>
  useQuery(
    orpc.conversations.counts.queryOptions({ input: {}, staleTime: FRESH_MS, retry: false }),
  );

export type InboxCounts = NonNullable<ReturnType<typeof useInboxCounts>['data']>;

/** The conversation's visitor as the messenger last saw them, kept fresh as they come and go. */
export const useVisitor = ({ id, customerId }: Pick<Conversation, 'id' | 'customerId'>) => {
  const queryClient = useQueryClient();
  const options = orpc.conversations.visitor.queryOptions({ input: { id } });

  useLiveSignal(PLUGIN, `visitor.${customerId.toLowerCase()}`, () => {
    void queryClient.invalidateQueries({ queryKey: options.queryKey });
  });

  return useQuery(options).data;
};

/** How long a typing signal shows, and how often the member's typing is sent. */
const TYPING_MS = 4000;

/** Whether the visitor typed in the last few seconds, from the conversation's typing signal. */
export const useVisitorTyping = (conversationId: string) => {
  // The conversation a typing signal came from, so another one opened shows none.
  const [typingIn, setTypingIn] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useLiveSignal(PLUGIN, `typing.${conversationId.toLowerCase()}`, () => {
    clearTimeout(timer.current);
    setTypingIn(conversationId);
    timer.current = setTimeout(() => setTypingIn(''), TYPING_MS);
  });

  useEffect(() => () => clearTimeout(timer.current), []);

  return typingIn === conversationId;
};

/** Tells the visitor the member is typing, at most once every few seconds. */
export const useSendTyping = (conversationId: string) => {
  const typing = useMutation(orpc.conversations.typing.mutationOptions());
  const last = useRef(0);

  return () => {
    const at = Date.now();

    if (at - last.current < TYPING_MS) return;

    last.current = at;
    typing.mutate({ id: conversationId });
  };
};

/** The conversation tags, as the filter bar and pickers read them. */
export const conversationTags = tagsOf('conversation');

export const useCreateTag = () =>
  useMutation(orpc.tags.create.mutationOptions(useChange(orpc.tags.key())));

/** The integrations of the member's channels: the filter bar's choices and the empty inbox's. */
export const useIntegrations = () => useQuery(integrationsQuery);

export const useIntegration = (id: string) =>
  useQuery(orpc.integrations.get.queryOptions({ input: { id }, staleTime: REFERENCE_MS }));

export const useIntegrationChange = () => useChange(orpc.integrations.key());
