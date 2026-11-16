import { type QueryKey, useQueryClient } from '@tanstack/react-query';
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
