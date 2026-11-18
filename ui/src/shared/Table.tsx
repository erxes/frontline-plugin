import {
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  RelativeDateDisplay,
  useFormat,
} from 'erxes-ui';
import type { ComponentProps, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Paging } from './paging.ts';

/** A column headed by `label` and its icon, drawing each row with `render`. */
export const column = <TRow extends object>(
  id: string,
  label: string,
  icon: ComponentProps<typeof RecordTable.InlineHead>['icon'],
  size: number,
  render: (row: TRow) => ReactNode,
): RecordTableColumnDef<TRow> => ({
  id,
  header: () => <RecordTable.InlineHead label={label} icon={icon} />,
  cell: ({ row }) => render(row.original),
  size,
});

/** A table's rows, all at once: skeletons while loading. */
export const Rows = ({ isPending, skeletons = 10 }: { isPending: boolean; skeletons?: number }) => (
  <RecordTable.Scroll>
    <RecordTable>
      <RecordTable.Header />
      <RecordTable.Body>
        {isPending && <RecordTable.RowSkeleton rows={skeletons} />}
        <RecordTable.RowList />
      </RecordTable.Body>
    </RecordTable>
  </RecordTable.Scroll>
);

/**
 * A table's rows a page at a time: skeletons while loading, the next page fetched on scroll down,
 * and a page the list dropped fetched again on scroll up.
 */
export const PagedRows = ({ paging, count }: { paging: Paging; count: number }) => (
  <RecordTable.CursorProvider
    hasNextPage={paging.hasNextPage}
    hasPreviousPage={paging.hasPreviousPage}
    dataLength={count}
  >
    <RecordTable>
      <RecordTable.Header />
      <RecordTable.Body>
        {paging.isPending && <RecordTable.RowSkeleton rows={10} />}
        <RecordTable.CursorBackwardSkeleton
          handleFetchMore={() => void paging.fetchPreviousPage()}
        />
        <RecordTable.RowList />
        <RecordTable.CursorForwardSkeleton handleFetchMore={() => void paging.fetchNextPage()} />
      </RecordTable.Body>
    </RecordTable>
  </RecordTable.CursorProvider>
);

/** A count that leads to the list of what it counts. */
export const CountCell = ({ to, count }: { to: string; count: number }) => {
  const format = useFormat();

  return (
    <RecordTableInlineCell>
      <Link to={to} className="tabular-nums hover:underline">
        {format.number(count)}
      </Link>
    </RecordTableInlineCell>
  );
};

/** A date as "3 days ago", with the full date on hover. */
export const DateCell = ({ date }: { date: Date }) => (
  <RecordTableInlineCell>
    <RelativeDateDisplay value={date.toISOString()}>
      <RelativeDateDisplay.Value value={date.toISOString()} />
    </RelativeDateDisplay>
  </RecordTableInlineCell>
);
