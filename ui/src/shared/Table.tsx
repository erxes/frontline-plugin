import {
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  RelativeDateDisplay,
} from 'erxes-ui';
import type { ComponentProps, ReactNode } from 'react';

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

/** A table's rows a page at a time: skeletons while loading, the next page fetched on scroll. */
export const PagedRows = ({
  isPending,
  hasNextPage,
  count,
  fetchNextPage,
}: {
  isPending: boolean;
  hasNextPage: boolean;
  count: number;
  fetchNextPage: () => void;
}) => (
  <RecordTable.CursorProvider hasNextPage={hasNextPage} dataLength={count}>
    <RecordTable>
      <RecordTable.Header />
      <RecordTable.Body>
        {isPending && <RecordTable.RowSkeleton rows={10} />}
        <RecordTable.RowList />
        <RecordTable.CursorForwardSkeleton handleFetchMore={fetchNextPage} />
      </RecordTable.Body>
    </RecordTable>
  </RecordTable.CursorProvider>
);

/** A date as "3 days ago", with the full date on hover. */
export const DateCell = ({ date }: { date: Date }) => (
  <RecordTableInlineCell>
    <RelativeDateDisplay value={date.toISOString()}>
      <RelativeDateDisplay.Value value={date.toISOString()} />
    </RelativeDateDisplay>
  </RecordTableInlineCell>
);
