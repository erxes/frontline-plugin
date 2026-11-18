import type { InferClientInputs } from '@orpc/client';
import {
  type InfiniteData,
  type QueryClient,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { orpc } from '~/orpc.ts';
import { useChange, useOptimistic, useRefusal } from '~/shared/hooks.ts';
import {
  type Conversation,
  type Counts,
  conversationOptions,
  LISTS,
  type ListPage,
  listedRow,
  type MessagePages,
  messagesOptions,
  refreshInbox,
} from './queries.ts';

type Inputs = InferClientInputs<Client>['conversations'];

/** What a change to conversations does when it settles: the inbox refreshes, a refusal shows. */
export const useInboxChange = () => {
  const queryClient = useQueryClient();

  return { onSuccess: () => refreshInbox(queryClient), onError: useRefusal() };
};

/** Rewrites the conversations of `ids` wherever the cache holds them: the open one and the lists. */
const patchConversations = (
  queryClient: QueryClient,
  ids: string[],
  patch: Partial<Conversation>,
) => {
  const apply = (row: Conversation) => (ids.includes(row.id) ? { ...row, ...patch } : row);

  queryClient.setQueriesData<InfiniteData<ListPage>>(
    { queryKey: LISTS },
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

/** The queries a change to a conversation writes into before the API answers. */
const PATCHED = [
  orpc.conversations.list.key(),
  orpc.conversations.counts.key(),
  orpc.conversations.get.key(),
];

/**
 * A change that shows at once on the conversations of `idsOf`, as `patch` says, and anything
 * else `also` writes. The messages keep loading; the inbox refreshes once it settles.
 */
const usePatch = <TInput>(
  idsOf: (input: TInput) => string[],
  patch: (input: TInput) => Partial<Conversation>,
  also?: (queryClient: QueryClient, input: TInput) => void,
) => {
  const queryClient = useQueryClient();

  return {
    ...useOptimistic(PATCHED, (client, input: TInput) => {
      also?.(client, input);
      patchConversations(client, idsOf(input), patch(input));
    }),
    onSettled: () => refreshInbox(queryClient),
  };
};

export const useAssign = () =>
  useMutation(
    orpc.conversations.assign.mutationOptions(
      usePatch(
        (input: Inputs['assign']) => input.ids,
        ({ assigneeId }) => ({ assigneeId }),
      ),
    ),
  );

export const useSetStatus = () =>
  useMutation(
    orpc.conversations.setStatus.mutationOptions(
      usePatch(
        (input: Inputs['setStatus']) => input.ids,
        ({ status }) => ({ status }),
      ),
    ),
  );

export const useSetTags = () =>
  useMutation(
    orpc.conversations.setTags.mutationOptions(
      usePatch(
        (input: Inputs['setTags']) => input.ids,
        ({ tagIds }) => ({ tagIds }),
      ),
    ),
  );

const less = (count: number) => Math.max(0, count - 1);

/**
 * The counts once `conversation` is read: one fewer unread in all, in its channel and its
 * kind, and in the unassigned and awaiting queues it is in. The queues that depend on the member
 * (assigned to them, mentioning them) wait for the refresh.
 */
const readCounts = (counts: Counts, conversation: Conversation): Counts => ({
  ...counts,
  unread: less(counts.unread),
  unassigned: conversation.assigneeId ? counts.unassigned : less(counts.unassigned),
  awaitingResponse: conversation.customerRespondedLast
    ? less(counts.awaitingResponse)
    : counts.awaitingResponse,
  channels: counts.channels.map((channel) =>
    channel.id === conversation.channelId
      ? {
          ...channel,
          unread: less(channel.unread),
          kinds: channel.kinds.map((kind) =>
            kind.kind === conversation.kind ? { ...kind, unread: less(kind.unread) } : kind,
          ),
        }
      : channel,
  ),
});

export const useMarkRead = () =>
  useMutation(
    orpc.conversations.markRead.mutationOptions(
      usePatch(
        (input: Inputs['markRead']) => [input.id],
        () => ({ isRead: true }),
        (queryClient, { id }) => {
          const conversation =
            queryClient.getQueryData(conversationOptions(id).queryKey) ??
            listedRow(queryClient, id)?.row;

          // Only open conversations count as waiting.
          if (!conversation || conversation.isRead || conversation.status === 'resolved') return;

          queryClient.setQueryData(
            orpc.conversations.counts.queryKey({ input: {} }),
            (counts) => counts && readCounts(counts, conversation),
          );
        },
      ),
    ),
  );

/**
 * Sends a reply or a note. It shows in the thread as soon as the API saves it; the rest of the
 * inbox follows with the refresh.
 */
export const useSendMessage = () => {
  const queryClient = useQueryClient();

  return useMutation(
    orpc.conversations.messages.create.mutationOptions({
      onSuccess: (message) => {
        queryClient.setQueryData<MessagePages>(
          messagesOptions(message.conversationId).queryKey,
          (data) =>
            data && {
              ...data,
              pages: data.pages.map((page, index) =>
                index === 0
                  ? {
                      ...page,
                      messages: [{ ...message, canEdit: true, reactions: [] }, ...page.messages],
                    }
                  : page,
              ),
            },
        );
        refreshInbox(queryClient);
      },
      onError: useRefusal(),
    }),
  );
};

/** A change to one message: its thread and the pinned ones refetch, and the inbox follows. */
export const useMessageChange = () => {
  const queryClient = useQueryClient();
  const change = useChange(orpc.conversations.messages.list.key());

  return {
    ...change,
    onSuccess: () => {
      change.onSuccess();
      refreshInbox(queryClient);
    },
  };
};

export const usePinMessage = () =>
  useMutation(orpc.conversations.messages.pin.mutationOptions(useMessageChange()));

export const useReact = () =>
  useMutation(orpc.conversations.messages.react.mutationOptions(useMessageChange()));

/** Saves an edit; its link previews refetch with it. */
export const useEditMessage = () => {
  const queryClient = useQueryClient();
  const change = useMessageChange();

  return useMutation(
    orpc.conversations.messages.update.mutationOptions({
      ...change,
      onSuccess: ({ id }) => {
        change.onSuccess();
        void queryClient.invalidateQueries({
          queryKey: orpc.conversations.messages.linkPreviews.key({ input: { id } }),
        });
      },
    }),
  );
};

export const useSetOperator = () =>
  useMutation(orpc.conversations.setOperator.mutationOptions(useInboxChange()));
