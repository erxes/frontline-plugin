import type { InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useListFilterParams, useLiveSignal } from 'erxes-ui';
import { parseAsString, useQueryState } from 'nuqs';
import { useEffect, useRef, useState } from 'react';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { useChange } from '~/shared/hooks.ts';

type Outputs = InferClientOutputs<Client>;

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

export const useConversation = (id: string) =>
  useQuery(orpc.conversations.get.queryOptions({ input: { id }, enabled: Boolean(id) }));

/** A conversation's messages, oldest first for reading, the older ones a page at a time. */
export const useMessages = (conversationId: string) => {
  const query = useInfiniteQuery(
    orpc.conversations.messages.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ conversationId, cursor }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );

  return {
    ...query,
    messages: (query.data?.pages.flatMap((page) => page.messages) ?? []).toReversed(),
  };
};

export const usePinnedMessages = (conversationId: string) =>
  useQuery(
    orpc.conversations.messages.list.queryOptions({ input: { conversationId, pinned: true } }),
  );

/** Refetches the inbox after a change, and shows a refusal. */
const useInboxChange = () => useChange(orpc.conversations.key());

export const useAssign = () =>
  useMutation(orpc.conversations.assign.mutationOptions(useInboxChange()));

export const useSetStatus = () =>
  useMutation(orpc.conversations.setStatus.mutationOptions(useInboxChange()));

export const useSetTags = () =>
  useMutation(orpc.conversations.setTags.mutationOptions(useInboxChange()));

export const useMarkRead = () =>
  useMutation(orpc.conversations.markRead.mutationOptions(useInboxChange()));

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
