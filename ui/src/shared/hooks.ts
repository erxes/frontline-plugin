import { type QueryClient, type QueryKey, useQueryClient } from '@tanstack/react-query';
import { toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';

/** Marks the queries under each key stale, refetching the ones on screen, without waiting. */
const refetch = (queryClient: QueryClient, keys: QueryKey[]) => {
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
};

/** Shows the API's refusal of a change as a toast. */
export const useRefusal = () => {
  const { t } = useTranslation('frontline');

  return (error: Error) =>
    toast({
      variant: 'destructive',
      title: t('change-failed', 'Could not save the change'),
      description: error.message,
    });
};

/**
 * What every change does when it settles: refetch the queries under `keys` on success, show the
 * API's refusal as a toast on failure. The change is done once the API answers; the refetch runs
 * behind it.
 */
export const useChange = (...keys: QueryKey[]) => {
  const queryClient = useQueryClient();

  return { onSuccess: () => refetch(queryClient, keys), onError: useRefusal() };
};

type Snapshot = ReturnType<QueryClient['getQueriesData']>;

/**
 * A mutation's options for a change that shows at once: the queries under `keys` stop loading,
 * `apply` writes the change into them before the request goes, they go back and the refusal
 * shows if the API says no, and they refetch once it settles. Only `keys` are touched, so the
 * other queries on screen keep loading.
 */
export const useOptimistic = <TInput>(
  keys: QueryKey[],
  apply: (queryClient: QueryClient, input: TInput) => void,
) => {
  const queryClient = useQueryClient();
  const refuse = useRefusal();

  return {
    onMutate: async (input: TInput) => {
      await Promise.all(keys.map((queryKey) => queryClient.cancelQueries({ queryKey })));

      const before: Snapshot = keys.flatMap((queryKey) => queryClient.getQueriesData({ queryKey }));

      apply(queryClient, input);

      return { before };
    },
    onError: (error: Error, _input: TInput, context: { before: Snapshot } | undefined) => {
      for (const [key, data] of context?.before ?? []) queryClient.setQueryData(key, data);

      refuse(error);
    },
    onSettled: () => refetch(queryClient, keys),
  };
};
