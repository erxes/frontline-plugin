import type { InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useListFilterParams, useLiveSignal } from 'erxes-ui';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { useChange } from '~/shared/hooks.ts';

type Outputs = InferClientOutputs<Client>['calls'];

export type Call = Outputs['get'];

export type Queue = Outputs['queues']['list'][number];

export type QueueLive = NonNullable<Outputs['queues']['get']['live']>;

/** The pages under `/frontline/calls`. */
export const CALLS_PATH = `/${PLUGIN}/calls`;

/** Refetches every call query when a PBX, CallPro or another member changes one. */
export const useCallsSignal = () => {
  const queryClient = useQueryClient();

  useLiveSignal(PLUGIN, 'calls', () => {
    void queryClient.invalidateQueries({ queryKey: orpc.calls.key() });
  });
};

/** The calls the filter bar keeps, newest first, a page at a time. */
export const useCalls = () => {
  const params = useListFilterParams();

  useCallsSignal();

  const query = useInfiniteQuery(
    orpc.calls.list.infiniteOptions({
      input: (cursor: string | undefined) => ({ ...params, cursor }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  );

  return {
    ...query,
    calls: query.data?.pages.flatMap((page) => page.calls) ?? [],
    totalCount: query.data?.pages[0]?.totalCount,
  };
};

/** One call: every slot of its panel reads this query. */
export const useCall = (id: string) => {
  useCallsSignal();

  return useQuery(orpc.calls.get.queryOptions({ input: { id } }));
};

/** Asks the PBX for the call's recording again. */
export const useFetchRecording = () =>
  useMutation(orpc.calls.fetchRecording.mutationOptions(useChange(orpc.calls.key())));

/** The queues of the PBXs the member answers, with the day's counters. */
export const useQueues = () => {
  useCallsSignal();

  return useQuery(orpc.calls.queues.list.queryOptions({ input: {} }));
};

/** One queue with its live board. */
export const useQueue = (id: string) => {
  useCallsSignal();

  return useQuery(orpc.calls.queues.get.queryOptions({ input: { id } }));
};

/** The member's extensions, and pausing or resuming them in their PBX's queues. */
export const useAgents = () => {
  const mine = useQuery(orpc.calls.agents.mine.queryOptions({ input: {} }));

  const setStatus = useMutation(
    orpc.calls.agents.setStatus.mutationOptions(useChange(orpc.calls.key())),
  );

  return { agents: mine.data ?? [], setStatus };
};

const pad = (value: number) => String(value).padStart(2, '0');

/** Seconds as `m:ss`, or `h:mm:ss` from an hour up; nothing for a call still going. */
export const durationText = (seconds: number | null) => {
  if (seconds === null) return '';

  const whole = Math.round(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = pad(whole % 60);

  return hours > 0 ? `${hours}:${pad(minutes)}:${rest}` : `${minutes}:${rest}`;
};
