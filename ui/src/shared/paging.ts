import type { InfiniteData } from '@tanstack/react-query';
import { useState } from 'react';

/**
 * Where a page starts: the cursor the API takes, and the cursors of the pages before it, so a
 * page dropped off the top can load again.
 */
export type PageParam = { cursor?: string; before: (string | undefined)[] };

/**
 * How many pages a list holds. Past it the far end drops and loads again on the way back, so a
 * long scroll stays light and a refetch asks for this many pages at most.
 */
const MAX_PAGES = 10;

const FIRST: PageParam = { before: [] };

/**
 * The paging every cursor list spreads into its `infiniteOptions`: `input` reads the cursor
 * from the page param, `({ cursor }: PageParam) => ({ ...filter, cursor })`.
 */
export const pageOptions = {
  initialPageParam: FIRST,
  getNextPageParam: (page: { nextCursor: string | null }, _pages: unknown, last: PageParam) =>
    page.nextCursor
      ? { cursor: page.nextCursor, before: [...last.before, last.cursor] }
      : undefined,
  getPreviousPageParam: (_page: unknown, _pages: unknown, first: PageParam) =>
    first.before.length > 0
      ? { cursor: first.before.at(-1), before: first.before.slice(0, -1) }
      : undefined,
  maxPages: MAX_PAGES,
};

/** What a paged list hands its table or its load buttons. */
export type Paging = {
  isPending: boolean;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  isFetchingNextPage: boolean;
  isFetchingPreviousPage: boolean;
  isFetchNextPageError: boolean;
  isFetchPreviousPageError: boolean;
  fetchNextPage: () => unknown;
  fetchPreviousPage: () => unknown;
};

/**
 * A paged list's rows, and how many match. Only the first page counts them, so the count holds
 * while the first page is dropped and comes back.
 */
export const usePaged = <TPage extends { totalCount?: number | null }, TRow, TQuery>(
  query: TQuery & { isPending: boolean; data?: InfiniteData<TPage, PageParam> },
  rowsOf: (page: TPage) => TRow[],
) => {
  const pages = query.data?.pages ?? [];
  const counted = query.data?.pageParams[0]?.before.length === 0 ? pages[0]?.totalCount : null;
  const [totalCount, setTotalCount] = useState(counted ?? undefined);

  if (counted != null && counted !== totalCount) setTotalCount(counted);

  return {
    ...query,
    rows: pages.flatMap(rowsOf),
    totalCount: query.isPending ? undefined : totalCount,
  };
};
