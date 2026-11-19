import { ORPCError } from '@orpc/client';
import { IconAlertTriangle, IconPlus, IconRefresh, IconSearchOff } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Empty, Kbd, useListFilterParams, useScopedHotkeys } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Paging } from './paging.ts';

/** What an empty list says: "No results" while filtered, otherwise `title` and how to start. */
export const ListEmpty = ({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) => {
  const { t } = useTranslation('frontline');
  const { filter, search: text } = useListFilterParams();
  const search = Boolean(filter ?? text);

  return (
    <Empty variant="outline" className="m-3">
      <Empty.Header>
        <Empty.Media>{search ? <IconSearchOff /> : icon}</Empty.Media>
        <Empty.Title>{search ? t('no-results-found', 'No results found') : title}</Empty.Title>
        <Empty.Description>
          {search ? t('try-different-search-term', 'Try a different search term') : description}
        </Empty.Description>
      </Empty.Header>
      {!search && action && <Empty.Content>{action}</Empty.Content>}
    </Empty>
  );
};

/**
 * "Try again" under a failed load; it refetches every query on screen that failed, or runs `retry`
 * when one is given, and spins until they settle. The API's refusals, such as a missing
 * permission, get none: asking again changes nothing.
 */
export const RetryButton = ({ error, retry }: { error: Error; retry?: () => void }) => {
  const { t } = useTranslation('frontline');
  const queryClient = useQueryClient();

  const asking = useMutation({
    mutationFn: async () =>
      retry
        ? retry()
        : queryClient.refetchQueries({
            type: 'active',
            predicate: (query) => query.state.status === 'error',
          }),
  });

  if (error instanceof ORPCError && error.status < 500) {
    return null;
  }

  return (
    <Button variant="outline" size="sm" disabled={asking.isPending} onClick={() => asking.mutate()}>
      <IconRefresh className={asking.isPending ? 'animate-spin' : undefined} />
      {t('try-again', 'Try again')}
    </Button>
  );
};

/**
 * What a page shows when its query failed: the API's message in an outlined empty state, and
 * Try again, which runs `retry` when given.
 */
export const ListError = ({ error, retry }: { error: Error; retry?: () => void }) => {
  const { t } = useTranslation('frontline');

  return (
    <Empty variant="outline" className="m-3" role="alert">
      <Empty.Header>
        <Empty.Media>
          <IconAlertTriangle />
        </Empty.Media>
        <Empty.Title>{t('could-not-load', 'Could not load this page')}</Empty.Title>
        <Empty.Description>{error.message}</Empty.Description>
      </Empty.Header>
      <Empty.Content>
        <RetryButton error={error} retry={retry} />
      </Empty.Content>
    </Empty>
  );
};

/** A list's create button, with C as its shortcut, for members who may create; others see none. */
export const CreateButton = ({
  allowed,
  label,
  onClick,
}: {
  allowed: boolean;
  label: string;
  onClick: () => void;
}) => {
  useScopedHotkeys('c', () => allowed && onClick(), 'app');

  if (!allowed) return null;

  return (
    <Button onClick={onClick}>
      <IconPlus />
      {label}
      <Kbd>C</Kbd>
    </Button>
  );
};

/**
 * The button under a paged list that loads its next page, or with `newer`, the one above it that
 * loads back a page the list dropped, saying so when that page failed. Nothing when there is no
 * such page.
 */
export const LoadPage = ({ paging, newer = false }: { paging: Paging; newer?: boolean }) => {
  const { t } = useTranslation('frontline');

  if (!(newer ? paging.hasPreviousPage : paging.hasNextPage)) return null;

  const failed = newer ? paging.isFetchPreviousPageError : paging.isFetchNextPageError;

  return (
    <Button
      variant="ghost"
      className="m-3 self-center"
      disabled={newer ? paging.isFetchingPreviousPage : paging.isFetchingNextPage}
      onClick={() => void (newer ? paging.fetchPreviousPage() : paging.fetchNextPage())}
    >
      {failed
        ? t('page-failed', 'That page did not load. Try again')
        : newer
          ? t('load-newer', 'Load newer')
          : t('load-more', 'Load more')}
    </Button>
  );
};
