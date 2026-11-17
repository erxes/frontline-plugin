import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import {
  type InfiniteData,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
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

type Outputs = InferClientOutputs<Client>;

type Inputs = InferClientInputs<Client>['conversations'];

export type Conversation = Outputs['conversations']['get'];

export type Message = Outputs['conversations']['messages']['list']['messages'][number];

export type Integration = Outputs['integrations']['get'];

/** The open conversation, in the address as the old inbox kept it. */
export const useOpenConversation = () =>
  useQueryState('conversationId', parseAsString.withDefault(''));

/** Refetches every inbox query when another member, a visitor or a provider changes one. */
const useInboxSignal = () => {
  const queryClient = useQueryClient();

  useLiveSignal(PLUGIN, 'conversations', () => {
    void queryClient.invalidateQueries({ queryKey: orpc.conversations.key() });
  });
};

/** The conversations the filter bar keeps, latest message first, a page at a time. */
export const useConversations = () => {
  const params = useListFilterParams();

  useInboxSignal();

  const query = useInfiniteQuery(
    orpc.conversations.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ ...params, cursor }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );

  return {
    ...query,
    conversations: query.data?.pages.flatMap((page) => page.conversations) ?? [],
    totalCount: query.data?.pages[0]?.totalCount,
  };
};

type ListPage = Outputs['conversations']['list'];

/** Every conversation the inbox's lists hold in the cache. */
const listedConversations = (queryClient: QueryClient) =>
  queryClient
    .getQueriesData<InfiniteData<ListPage>>({
      queryKey: orpc.conversations.list.key({ type: 'infinite' }),
    })
    .flatMap(([, data]) => data?.pages.flatMap((page) => page.conversations) ?? []);

const conversationOptions = (id: string) =>
  orpc.conversations.get.queryOptions({ input: { id }, enabled: Boolean(id) });

/**
 * One conversation. A conversation picked from the list shows at once from the list's row, and
 * refreshes from the API behind it.
 */
export const useConversation = (id: string) => {
  const queryClient = useQueryClient();

  return useQuery({
    ...conversationOptions(id),
    initialData: () => listedConversations(queryClient).find((row) => row.id === id),
    initialDataUpdatedAt: 0,
  });
};

const messagesOptions = (conversationId: string) =>
  orpc.conversations.messages.list.infiniteOptions({
    enabled: Boolean(conversationId),
    input: (cursor: string | undefined) => ({ conversationId, cursor }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });

/** How long a prefetched thread counts as fresh, so moving the pointer back and forth asks once. */
const PREFETCH_FRESH_MS = 30_000;

/**
 * Loads a conversation's messages before it opens, as the pointer rests on its row or the keys
 * move to it, so opening it shows the thread at once.
 */
export const usePrefetchConversation = () => {
  const queryClient = useQueryClient();

  return (conversation: Conversation) => {
    // A failed prefetch is only a slower open; the thread shows its own error.
    queryClient
      .infiniteQuery({ ...messagesOptions(conversation.id), staleTime: PREFETCH_FRESH_MS })
      .catch(() => undefined);
  };
};

/** A conversation's messages, oldest first for reading, the older ones a page at a time. */
export const useMessages = (conversationId: string) => {
  const query = useInfiniteQuery(messagesOptions(conversationId));

  return {
    ...query,
    messages: (query.data?.pages.flatMap((page) => page.messages) ?? []).toReversed(),
  };
};

export const usePinnedMessages = (conversationId: string) =>
  useQuery(
    orpc.conversations.messages.list.queryOptions({ input: { conversationId, pinned: true } }),
  );

/** Cards for the web links in a message's text; only one with a link asks. */
export const useLinkPreviews = (message: Message) =>
  useQuery({
    ...orpc.conversations.messages.linkPreviews.queryOptions({ input: { id: message.id } }),
    enabled: /https?:\/\//.test(message.content),
  });

/** Refetches the inbox after a change, and shows a refusal. */
export const useInboxChange = () => useChange(orpc.conversations.key());

/** Rewrites the conversations of `ids` wherever the cache holds them: the open one and the lists. */
const patchConversations = (
  queryClient: QueryClient,
  ids: string[],
  patch: Partial<Conversation>,
) => {
  const apply = (row: Conversation) => (ids.includes(row.id) ? { ...row, ...patch } : row);

  queryClient.setQueriesData<InfiniteData<ListPage>>(
    { queryKey: orpc.conversations.list.key({ type: 'infinite' }) },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          conversations: page.conversations.map(apply),
        })),
      },
  );

  for (const id of ids)
    queryClient.setQueryData(conversationOptions(id).queryKey, (row) => row && apply(row));
};

/**
 * A change that shows at once: the cached conversations take `patch` before the request goes,
 * go back if the API refuses, and the inbox refetches once it settles.
 */
const useOptimistic = <TInput>(
  idsOf: (input: TInput) => string[],
  patch: (input: TInput) => Partial<Conversation>,
) => {
  const queryClient = useQueryClient();
  const { onError } = useInboxChange();
  const queryKey = orpc.conversations.key();

  return {
    onMutate: async (input: TInput) => {
      await queryClient.cancelQueries({ queryKey });

      const before = queryClient.getQueriesData({ queryKey });

      patchConversations(queryClient, idsOf(input), patch(input));

      return { before };
    },
    onError: (
      error: Error,
      _input: TInput,
      context: { before: ReturnType<QueryClient['getQueriesData']> } | undefined,
    ) => {
      for (const [key, data] of context?.before ?? []) queryClient.setQueryData(key, data);

      onError(error);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  };
};

export const useAssign = () =>
  useMutation(
    orpc.conversations.assign.mutationOptions(
      useOptimistic(
        (input: Inputs['assign']) => input.ids,
        ({ assigneeId }) => ({ assigneeId }),
      ),
    ),
  );

export const useSetStatus = () =>
  useMutation(
    orpc.conversations.setStatus.mutationOptions(
      useOptimistic(
        (input: Inputs['setStatus']) => input.ids,
        ({ status }) => ({ status }),
      ),
    ),
  );

export const useSetTags = () =>
  useMutation(
    orpc.conversations.setTags.mutationOptions(
      useOptimistic(
        (input: Inputs['setTags']) => input.ids,
        ({ tagIds }) => ({ tagIds }),
      ),
    ),
  );

export const useMarkRead = () =>
  useMutation(
    orpc.conversations.markRead.mutationOptions(
      useOptimistic(
        (input: Inputs['markRead']) => [input.id],
        () => ({ isRead: true }),
      ),
    ),
  );

export const useSendMessage = () =>
  useMutation(orpc.conversations.messages.create.mutationOptions(useInboxChange()));

export const usePinMessage = () =>
  useMutation(orpc.conversations.messages.pin.mutationOptions(useInboxChange()));

export const useReact = () =>
  useMutation(orpc.conversations.messages.react.mutationOptions(useInboxChange()));

export const useEditMessage = () =>
  useMutation(orpc.conversations.messages.update.mutationOptions(useInboxChange()));

export const useSetOperator = () =>
  useMutation(orpc.conversations.setOperator.mutationOptions(useInboxChange()));

/**
 * How many conversations wait unread by the member: in all, in each sidebar queue and in each of
 * their channels, kept live as messages arrive.
 */
export const useInboxCounts = () => {
  useInboxSignal();

  return useQuery(orpc.conversations.counts.queryOptions({ input: {} })).data;
};

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
export const conversationTags = orpc.tags.list.queryOptions({ input: { type: 'conversation' } });

export const useCreateTag = () =>
  useMutation(orpc.tags.create.mutationOptions(useChange(orpc.tags.key())));

/** The integrations of the member's channels: the filter bar's choices and the empty inbox's. */
export const useIntegrations = () => useQuery(orpc.integrations.list.queryOptions({ input: {} }));

export const useIntegration = (id: string) =>
  useQuery(orpc.integrations.get.queryOptions({ input: { id } }));

export const useIntegrationChange = () => useChange(orpc.integrations.key());
