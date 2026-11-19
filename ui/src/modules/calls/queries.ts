import type { InferClientOutputs } from '@orpc/client';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useListFilterParams, useLiveSignal } from 'erxes-ui';
import { orpc } from '~/orpc.ts';
import { type PageParam, pageOptions, usePaged } from '~/shared/paging.ts';
import { PLUGIN } from '~/plugin.ts';
import { useChange } from '~/shared/hooks.ts';

type Outputs = InferClientOutputs<Client>['calls'];

export type Call = Outputs['get'];

export type Queue = Outputs['queues']['list'][number];

export type QueueLive = NonNullable<Outputs['queues']['get']['live']>;

/** The pages under `/frontline/calls`. */
export const CALLS_PATH = `/${PLUGIN}/calls`;

/** The member's phone: the dial pad, the call they are on and its note. */
export const PHONE_PATH = `${CALLS_PATH}/phone`;

/**
 * The member's SIP lines, which the softphone signs in to. A refetch would sign the phone in
 * again, so they last as long as the page.
 */
export const phoneLinesQuery = {
  ...orpc.calls.phone.lines.queryOptions({ input: {} }),
  retry: false,
  staleTime: Infinity,
};

/**
 * What a call changes: the history, each call, the queues' boards and the member's extensions.
 * Not the softphone's lines, whose refetch would sign the phone in again.
 */
const CALL_KEYS = [
  orpc.calls.list.key(),
  orpc.calls.get.key(),
  orpc.calls.queues.key(),
  orpc.calls.agents.key(),
];

/** Refetches the call queries when a PBX, CallPro or another member changes a call. */
export const useCallsSignal = () => {
  const queryClient = useQueryClient();

  useLiveSignal(PLUGIN, 'calls', () => {
    for (const queryKey of CALL_KEYS) void queryClient.invalidateQueries({ queryKey });
  });
};

/** The calls the filter bar keeps, newest first, a page at a time. */
export const useCalls = () => {
  const params = useListFilterParams();

  useCallsSignal();

  return usePaged(
    useInfiniteQuery(
      orpc.calls.list.infiniteOptions({
        input: ({ cursor }: PageParam) => ({ ...params, cursor }),
        ...pageOptions,
      }),
    ),
    (page) => page.calls,
  );
};

/** One call: every slot of its panel reads this query. */
export const useCall = (id: string) => {
  useCallsSignal();

  return useQuery(orpc.calls.get.queryOptions({ input: { id } }));
};

/** Asks the PBX for the call's recording again. */
export const useFetchRecording = () =>
  useMutation(orpc.calls.fetchRecording.mutationOptions(useChange(...CALL_KEYS)));

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

/** One empty list while the extensions load, so effects that read them don't rerun each render. */
const NO_AGENTS: never[] = [];

/** The member's extensions, and pausing or resuming them in their PBX's queues. */
export const useAgents = () => {
  const mine = useQuery(orpc.calls.agents.mine.queryOptions({ input: {} }));

  const setStatus = useMutation(
    orpc.calls.agents.setStatus.mutationOptions(useChange(...CALL_KEYS)),
  );

  return { agents: mine.data ?? NO_AGENTS, setStatus };
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
