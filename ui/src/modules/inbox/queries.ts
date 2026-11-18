import { contactQueries, orpc as core } from '@erxes/core-contract/client';
import type { InferClientOutputs } from '@orpc/client';
import {
  hashKey,
  type InfiniteData,
  type QueryClient,
  type QueryKey,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useListFilterParams, useLiveSignal } from 'erxes-ui';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useRef, useState } from 'react';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { useChange } from '~/shared/hooks.ts';
import { type PageParam, pageOptions, usePaged } from '~/shared/paging.ts';
import { integrationsQuery, REFERENCE_MS, tagsOf } from '~/shared/reference.ts';

type Outputs = InferClientOutputs<Client>;

export type Conversation = Outputs['conversations']['get'];

export type Message = Outputs['conversations']['messages']['list']['messages'][number];

export type Integration = Outputs['integrations']['get'];

export type ListPage = Outputs['conversations']['list'];

export type MessagePages = InfiniteData<Outputs['conversations']['messages']['list'], PageParam>;

export type Counts = Outputs['conversations']['counts'];

/** The open conversation, in the address as the old inbox kept it. */
export const useOpenConversation = () =>
  useQueryState('conversationId', parseAsString.withDefault(''));

/**
 * How long the inbox's own queries count as fresh, so opening, closing and reopening a
 * conversation asks once. The live signal refetches them as soon as anything changes.
 */
const FRESH_MS = 30_000;

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

let pending = new Map<string, QueryKey>();
let refreshing: ReturnType<typeof setTimeout> | undefined;

/**
 * Refetches the queries under `keys`, gathered for a second: a burst of live signals, and the
 * member's own changes with them, become one refetch at its end. Only the queries on screen
 * refetch; the rest wait until they show again.
 */
const refresh = (queryClient: QueryClient, keys: QueryKey[]) => {
  for (const key of keys) pending.set(hashKey(key), key);

  refreshing ??= setTimeout(() => {
    const due = [...pending.values()];

    pending = new Map();
    refreshing = undefined;

    for (const queryKey of due) void queryClient.invalidateQueries({ queryKey });
  }, REFRESH_MS);
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
 * The customers of the list's conversations, one request a page. Each lands where a customer's
 * own query reads it, so the open conversation's thread and sidebar ask for none.
 */
const usePageCustomers = (pages: ListPage[]) => {
  const queryClient = useQueryClient();

  return useQueries({
    queries: pages.map((page) => {
      const ids = [...new Set(page.conversations.map((row) => row.customerId))].toSorted();

      return {
        queryKey: [PLUGIN, 'page-customers', ids],
        queryFn: async () => {
          const { data } = await core.customers.list.call({
            ids: ids.join(','),
            limit: ids.length,
          });

          for (const customer of data)
            queryClient.setQueryData(contactQueries.customer(customer.id).queryKey, customer);

          return data;
        },
        enabled: ids.length > 0,
        staleTime: CUSTOMER_MS,
      };
    }),
    combine: (results) =>
      new Map(results.flatMap((result) => result.data ?? []).map((row) => [row.id, row])),
  });
};

/**
 * The conversations the filter bar keeps, latest message first, a page at a time, and their
 * customers by id.
 */
export const useConversations = () => {
  const params = useListFilterParams();

  const query = usePaged(
    useInfiniteQuery(
      orpc.conversations.list.infiniteOptions({
        input: ({ cursor }: PageParam) => ({ ...params, cursor }),
        ...pageOptions,
        staleTime: FRESH_MS,
      }),
    ),
    (page) => page.conversations,
  );

  return { ...query, customers: usePageCustomers(query.data?.pages ?? []) };
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
  orpc.conversations.get.queryOptions({
    input: { id },
    enabled: Boolean(id),
    staleTime: FRESH_MS,
  });

/**
 * One conversation. A conversation picked from the list shows at once from the list's row, and
 * asks the API only once that row is older than the inbox's fresh time.
 */
export const useConversation = (id: string) => {
  const queryClient = useQueryClient();

  return useQuery({
    ...conversationOptions(id),
    initialData: () => listedRow(queryClient, id)?.row,
    initialDataUpdatedAt: () => listedRow(queryClient, id)?.updatedAt,
  });
};

export const messagesOptions = (conversationId: string) =>
  orpc.conversations.messages.list.infiniteOptions({
    enabled: Boolean(conversationId),
    input: ({ cursor }: PageParam) => ({ conversationId, cursor }),
    ...pageOptions,
    staleTime: FRESH_MS,
  });

/**
 * Loads a conversation's messages before it opens, as the pointer rests on its row or the keys
 * move to it, so opening it shows the thread at once.
 */
export const usePrefetchConversation = () => {
  const queryClient = useQueryClient();

  return (conversation: Conversation) => {
    // A failed prefetch is only a slower open; the thread shows its own error.
    queryClient.infiniteQuery(messagesOptions(conversation.id)).catch(() => undefined);
  };
};

/**
 * A conversation's messages, oldest first for reading. The older ones load a page at a time as
 * next pages, the newer ones as previous pages once a long read back dropped them.
 */
export const useMessages = (conversationId: string) => {
  const query = useInfiniteQuery(messagesOptions(conversationId));

  return {
    ...query,
    messages: (query.data?.pages.flatMap((page) => page.messages) ?? []).toReversed(),
  };
};

export const usePinnedMessages = (conversationId: string) =>
  useQuery(
    orpc.conversations.messages.list.queryOptions({
      input: { conversationId, pinned: true },
      staleTime: FRESH_MS,
    }),
  );

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
 * their channels, kept live by the layout's signal.
 */
export const useInboxCounts = () =>
  useQuery(orpc.conversations.counts.queryOptions({ input: {}, staleTime: FRESH_MS })).data;

/** The conversation's visitor as the messenger last saw them, kept fresh as they come and go. */
export const useVisitor = (conversationId: string) => {
  const queryClient = useQueryClient();
  const options = orpc.conversations.visitor.queryOptions({ input: { id: conversationId } });

  useLiveSignal(PLUGIN, 'visitors', () => {
    void queryClient.invalidateQueries({ queryKey: options.queryKey });
  });

  return useQuery(options).data;
};

/** How long a typing signal shows, and how often the member's typing is sent. */
const TYPING_MS = 4000;

/** Whether the visitor typed in the last few seconds, from the conversation's typing signal. */
export const useVisitorTyping = (conversationId: string) => {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(0);

  useLiveSignal(PLUGIN, `typing.${conversationId.toLowerCase()}`, () => {
    const at = Date.now();

    setNow(at);
    setUntil(at + TYPING_MS);
  });

  useEffect(() => {
    if (until <= now) return;

    const timer = setTimeout(() => setNow(Date.now()), until - now);

    return () => clearTimeout(timer);
  }, [until, now]);

  return until > now;
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
