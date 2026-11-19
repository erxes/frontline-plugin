import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, Skeleton, Table, useFormat, useOpenRecord } from 'erxes-ui';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RetryButton } from '~/shared/List.tsx';
import { MemberLine, useCustomer } from '~/shared/Person.tsx';
import type { Records } from './cards.ts';
import { type Cell, PAGE, RECORDS_KEY, type Page, SOURCES, useListLabels } from './records.ts';
import { Nothing } from './Tile.tsx';

/** The customer's name, else their email or phone, else "Visitor". */
const CustomerName = ({ id }: { id: string | null }) => useCustomer(id).name;

/** A row's cell: a member by their line, a customer by name, the rest as text. */
const CellView = ({ cell }: { cell: Cell }): ReactNode => {
  if (typeof cell === 'string') return cell;

  return 'member' in cell ? <MemberLine id={cell.member} /> : <CustomerName id={cell.customer} />;
};

/** A row's first cell: it opens the record in core's side panel. */
const OpenButton = ({
  contentType,
  id,
  children,
}: {
  contentType: string;
  id: string;
  children: ReactNode;
}) => {
  const { open } = useOpenRecord();

  return (
    <button
      type="button"
      className="max-w-full truncate text-left hover:underline"
      onClick={() => open({ contentType, contentId: id })}
    >
      {children}
    </button>
  );
};

/** How many records the list holds, the page it shows, and the buttons to the pages beside it. */
const Pager = ({
  total,
  page,
  onPrevious,
  onNext,
}: {
  total: number | undefined;
  page: number;
  onPrevious?: () => void;
  onNext?: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>
        {total !== undefined &&
          t('report-total', 'Total: {{formatted}}', { formatted: format.number(total) })}
      </span>
      <span className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label={t('previous-page', 'Previous page')}
          disabled={!onPrevious}
          onClick={onPrevious}
        >
          <IconChevronLeft />
        </Button>
        <span className="tabular-nums">
          {total === undefined
            ? page
            : t('page-of', '{{page}} / {{pages}}', {
                page,
                pages: Math.max(Math.ceil(total / PAGE), 1),
              })}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('next-page', 'Next page')}
          disabled={!onNext}
          onClick={onNext}
        >
          <IconChevronRight />
        </Button>
      </span>
    </div>
  );
};

/**
 * The records a card counts, `PAGE` at a time, newest first, with how many there are and
 * Previous and Next. A row's first cell opens its record in core's side panel.
 */
export const CardRecords = ({
  records,
  filter,
  empty,
}: {
  records: Records;
  filter: string;
  empty: string;
}) => {
  const labels = useListLabels();
  const source = SOURCES[records];

  const [pages, setPages] = useState<{ filter: string; cursors: string[] }>({
    filter,
    cursors: [],
  });

  // A new filter starts at the first page.
  const cursors = pages.filter === filter ? pages.cursors : [];
  const cursor = cursors.at(-1);

  const pageOf = (at: string | undefined) => ({
    queryKey: [...RECORDS_KEY, records, filter, at ?? null],
    queryFn: () => source.fetch(filter, at, PAGE, labels),
  });

  const query = useQuery({ ...pageOf(cursor), placeholderData: (previous?: Page) => previous });
  // Only the first page counts the rows; a later one reads its count from there.
  const total = useQuery(pageOf(undefined)).data?.totalCount;

  if (query.error)
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-sm text-destructive">{query.error.message}</p>
        <RetryButton error={query.error} />
      </div>
    );

  if (!query.data) return <Skeleton className="h-48" />;

  if (query.data.lines.length === 0 && cursors.length === 0) return <Nothing>{empty}</Nothing>;

  const heads = source.heads(labels);
  const next = query.data.nextCursor;

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <Table.Header>
          <Table.Row>
            {heads.map((head) => (
              <Table.Head key={head}>{head}</Table.Head>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {query.data.lines.map((line) => (
            <Table.Row key={line.id}>
              {line.cells.map((cell, index) => (
                <Table.Cell key={heads[index]}>
                  <span className="block max-w-48 truncate px-3">
                    {index === 0 ? (
                      <OpenButton contentType={source.contentType} id={line.id}>
                        <CellView cell={cell} />
                      </OpenButton>
                    ) : (
                      <CellView cell={cell} />
                    )}
                  </span>
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <Pager
        total={total}
        page={cursors.length + 1}
        onPrevious={
          cursors.length > 0 ? () => setPages({ filter, cursors: cursors.slice(0, -1) }) : undefined
        }
        onNext={next ? () => setPages({ filter, cursors: [...cursors, next] }) : undefined}
      />
    </div>
  );
};
