import { RecordTable, RecordTableInlineCell, RelativeDateDisplay } from 'erxes-ui';

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
