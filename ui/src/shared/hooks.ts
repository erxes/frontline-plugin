import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { toast } from 'erxes-ui';
import { useQueryState } from 'nuqs';
import { useTranslation } from 'react-i18next';

/** The query string key erxes-ui's Filter writes its search to. */
export const SEARCH_KEY = 'searchValue';

/** A form field's text from FormData, or '' when it's missing or a file. */
export const textOf = (value: FormDataEntryValue | null) =>
  typeof value === 'string' ? value : '';

/** What the list's search filter holds, or null. */
export const useSearch = () => useQueryState(SEARCH_KEY)[0];

/**
 * A side panel kept in the query string under `key`, so a link or reload
 * reopens it: `?template=new` or `?template=<id>`.
 */
export const useParamPanel = (key: string) => {
  const [value, setValue] = useQueryState(key);

  return { value, open: (next: string) => void setValue(next), close: () => void setValue(null) };
};

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
