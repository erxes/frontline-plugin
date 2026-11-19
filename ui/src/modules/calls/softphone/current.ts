import { useQuery } from '@tanstack/react-query';
import { orpc } from '~/orpc.ts';
import type { Line } from './useSip.ts';

/** How often the phone asks again for a call the PBX hasn't reported yet. */
const ASK_AGAIN_MS = 3000;

/**
 * The call as erxes knows it, once the PBX has reported it: its conversation, for the note, and
 * its customer's name when core has one. Kept under `callCount`, so it outlasts the call for the
 * note, and a new call starts with neither.
 */
export const useCurrentCall = (line: Line, callCount: number, onCall: boolean) => {
  const input = { accountId: line.accountId };

  const current = useQuery({
    ...orpc.calls.phone.current.queryOptions({ input }),
    queryKey: [...orpc.calls.phone.current.queryKey({ input }), callCount],
    enabled: onCall,
    refetchInterval: (query) => (query.state.data ? false : ASK_AGAIN_MS),
  });

  const customerId = current.data?.customerId;

  const caller = useQuery({
    ...orpc.calls.phone.caller.queryOptions({ input: { customerId: customerId ?? '' } }),
    enabled: customerId !== undefined,
    retry: false,
  });

  return { current: current.data ?? null, caller: caller.data?.name ?? null };
};

/** The call's row in erxes, null until the PBX reports the call. */
export type CurrentCall = ReturnType<typeof useCurrentCall>['current'];
