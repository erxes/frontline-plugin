import { type QueryClient, type QueryKey, useQueryClient } from '@tanstack/react-query';
import { toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';

/** A form field's or draft default's text, or '' when it's missing, a file or not text. */
export const textOf = (value: unknown) => (typeof value === 'string' ? value : '');

/**
 * What every change does when it settles: refetch the queries under `queryKey`
 * on success, show the API's refusal as a toast on failure.
 */
export const useChange = (queryKey: QueryKey) => {
  const { t } = useTranslation('frontline');
  const queryClient = useQueryClient();

  return {
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error: Error) =>
      toast({
        variant: 'destructive',
        title: t('change-failed', 'Could not save the change'),
        description: error.message,
      }),
  };
};

/**
 * A mutation's options for a change that shows at once: `apply` writes it into the cache before
 * the request goes, the queries under `queryKey` go back and the refusal shows if the API says
 * no, and they refetch once it settles.
 */
export const useOptimistic = <TInput>(
  queryKey: QueryKey,
  apply: (queryClient: QueryClient, input: TInput) => void,
) => {
  const queryClient = useQueryClient();
  const { onError } = useChange(queryKey);

  return {
    onMutate: async (input: TInput) => {
      await queryClient.cancelQueries({ queryKey });

      const before = queryClient.getQueriesData({ queryKey });

      apply(queryClient, input);

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
