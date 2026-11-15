import { memberQueries } from '@erxes/core-contract/client';
import { IconTicket } from '@tabler/icons-react';
import {
  Button,
  DisplayMenu,
  ListFilter,
  PageContainer,
  PageHeader,
  RecordList,
  useListDisplay,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { TICKET_TYPE } from '~/plugin.ts';
import { CreateButton, ListEmpty } from '~/shared/List.tsx';
import { ListSelectionBar, SelectionBar } from '~/shared/Records.tsx';
import { TicketBulkActions } from './TicketBulkActions.tsx';
import { SortMenu, useTicketFields } from './TicketFilter.tsx';
import { TicketList } from './TicketList.tsx';
import { TicketsBoard } from './TicketsBoard.tsx';
import { TicketsTable } from './TicketsTable.tsx';
import { type Ticket, useChoices, useTickets } from './queries.ts';

const LIST = 'frontline-tickets';

/** Grouped by status first, as the old list; the board and table show the same tickets. */
const DISPLAYS = ['list', 'board', 'table'] as const;

/** The bulk bar's actions for the picked ids, read from the tickets shown. */
const bulkOf = (tickets: Ticket[]) => (selected: string[], clear: () => void) => (
  <TicketBulkActions
    tickets={tickets.filter((ticket) => selected.includes(ticket.id))}
    clear={clear}
  />
);

/** The page header, as core's breadcrumb draws it, and Create ticket. */
const TicketsHeader = ({ canCreate, create }: { canCreate: boolean; create: () => void }) => {
  const { t } = useTranslation('frontline');

  return (
    <PageHeader>
      <PageHeader.Start>
        <span className="flex h-8 items-center gap-1.5 px-3 text-sm font-medium">
          <IconTicket />
          {t('tickets', 'Tickets')}
        </span>
      </PageHeader.Start>
      <PageHeader.End>
        <CreateButton
          allowed={canCreate}
          label={t('create-ticket', 'Create ticket')}
          onClick={create}
        />
      </PageHeader.End>
    </PageHeader>
  );
};

/**
 * Every ticket of the member's channels under core's list bar: the filter (`F`) on every field
 * the old page filtered by, Sort, and Display, which groups them by status, lays them on a board
 * or shows a table. A ticket opens in core's side panel; Create ticket drafts one there.
 */
export const TicketsPage = () => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const [display] = useListDisplay(LIST, DISPLAYS);
  const canCreate = useChoices().pipelines.length > 0;
  const create = () => openNew(TICKET_TYPE);

  const { tickets, totalCount, isPending, error, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useTickets();

  const loadMore = hasNextPage && display !== 'table' && (
    <Button
      variant="ghost"
      className="m-3 self-center"
      disabled={isFetchingNextPage}
      onClick={() => void fetchNextPage()}
    >
      {t('load-more', 'Load more')}
    </Button>
  );

  return (
    <PageContainer>
      <TicketsHeader canCreate={canCreate} create={create} />
      <ViewBar allLabel={t('all-tickets', 'All tickets')}>
        <ListFilter
          id={LIST}
          fields={useTicketFields()}
          members={memberQueries}
          totalCount={totalCount}
        >
          <SortMenu />
          <DisplayMenu list={LIST} displays={DISPLAYS} />
        </ListFilter>
      </ViewBar>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && tickets.length === 0 ? (
        <ListEmpty
          icon={<IconTicket />}
          title={t('no-tickets-yet', 'No tickets yet')}
          description={t('no-tickets-description', 'Create a ticket in one of your pipelines.')}
          action={
            canCreate && <Button onClick={create}>{t('create-ticket', 'Create ticket')}</Button>
          }
        />
      ) : display === 'table' ? (
        <TicketsTable
          tickets={tickets}
          isPending={isPending}
          hasNextPage={hasNextPage}
          fetchNextPage={() => void fetchNextPage()}
        >
          <SelectionBar>{bulkOf(tickets)}</SelectionBar>
        </TicketsTable>
      ) : display === 'board' ? (
        <>
          <TicketsBoard tickets={tickets} />
          {loadMore}
        </>
      ) : (
        <RecordList.Provider listId={LIST}>
          {isPending ? <RecordList.Skeleton /> : <TicketList tickets={tickets} />}
          {loadMore}
          <ListSelectionBar shown={tickets.map((ticket) => ticket.id)}>
            {bulkOf(tickets)}
          </ListSelectionBar>
        </RecordList.Provider>
      )}
    </PageContainer>
  );
};
