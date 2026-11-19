import { memberQueries } from '@erxes/core-contract/client';
import { IconTicket } from '@tabler/icons-react';
import {
  Button,
  DisplayMenu,
  ListFilter,
  PageContainer,
  RecordList,
  useListDisplay,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { TICKET_TYPE } from '~/plugin.ts';
import { AppHeader } from '~/shared/Header.tsx';
import { CreateButton, ListEmpty, LoadPage } from '~/shared/List.tsx';
import { QueryBoundary } from '~/shared/QueryBoundary.tsx';
import { ListSelectionBar, SelectionBar } from '~/shared/Records.tsx';
import { TicketBulkActions } from './TicketBulkActions.tsx';
import { ticketTags } from './TicketLinks.tsx';
import { SortMenu, useTicketFields } from './TicketFilter.tsx';
import { TicketList } from './TicketList.tsx';
import { TicketsBoard } from './TicketsBoard.tsx';
import { TicketsTable } from './TicketsTable.tsx';
import {
  type TicketRow,
  useShownPipeline,
  useTicketCount,
  useTicketPipeline,
  useTickets,
} from './queries.ts';

const LIST = 'frontline-tickets';

/** Grouped by status first, as the old list; the board and table show the same tickets. */
const DISPLAYS = ['list', 'board', 'table'] as const;

/** The bulk bar's actions for the picked ids, read from the tickets shown. */
const bulkOf = (tickets: TicketRow[]) => (selected: string[], clear: () => void) => (
  <TicketBulkActions
    tickets={tickets.filter((ticket) => selected.includes(ticket.id))}
    clear={clear}
  />
);

/** The page header, as core's breadcrumb draws it: Tickets, the shown pipeline, Create ticket. */
const TicketsHeader = ({
  pipeline,
  canCreate,
  create,
}: {
  pipeline?: string;
  canCreate: boolean;
  create: () => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <AppHeader
      icon={IconTicket}
      app={{ label: t('tickets', 'Tickets') }}
      levels={pipeline ? [{ label: pipeline }] : []}
    >
      <CreateButton
        allowed={canCreate}
        label={t('create-ticket', 'Create ticket')}
        onClick={create}
      />
    </AppHeader>
  );
};

type Shown = { pipeline: string; create: () => void };

/** A pipeline with no tickets the filter bar keeps. */
const NoTickets = ({ pipeline, create }: Shown) => {
  const { t } = useTranslation('frontline');

  return (
    <ListEmpty
      icon={<IconTicket />}
      title={t('no-tickets-in', 'No tickets in {{pipeline}} yet', { pipeline })}
      description={t('no-tickets-in-description', 'Create one here, or pick another pipeline.')}
      action={<Button onClick={create}>{t('create-ticket', 'Create ticket')}</Button>}
    />
  );
};

/** The board: its columns ask for their tickets at once, beside the count that says if any match. */
const BoardTickets = (shown: Shown) =>
  useTicketCount() === 0 ? <NoTickets {...shown} /> : <TicketsBoard />;

/**
 * The shown pipeline's tickets, grouped by status or in a table. It suspends until the first page
 * is in, and a new filter, sort or pipeline keeps the old tickets up until the new ones are.
 */
const ListedTickets = ({ table, ...shown }: Shown & { table: boolean }) => {
  const list = useTickets();
  const { rows: tickets } = list;

  if (tickets.length === 0) return <NoTickets {...shown} />;

  if (table)
    return (
      <TicketsTable tickets={tickets} paging={list}>
        <SelectionBar>{bulkOf(tickets)}</SelectionBar>
      </TicketsTable>
    );

  return (
    <RecordList.Provider listId={LIST}>
      <LoadPage paging={list} newer />
      <TicketList tickets={tickets} />
      <LoadPage paging={list} />
      <ListSelectionBar shown={tickets.map((ticket) => ticket.id)}>
        {bulkOf(tickets)}
      </ListSelectionBar>
    </RecordList.Provider>
  );
};

/** The tickets once the choices are in, or why there are none: no pipeline to file them under. */
const TicketsBody = ({
  display,
  create,
}: {
  display: (typeof DISPLAYS)[number];
  create: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const pipeline = useShownPipeline();

  if (!pipeline)
    return (
      <ListEmpty
        icon={<IconTicket />}
        title={t('no-tickets-yet', 'No tickets yet')}
        description={t('no-ticket-pipelines', 'A channel admin adds pipelines in its settings.')}
      />
    );

  if (display === 'board') return <BoardTickets pipeline={pipeline.name} create={create} />;

  return <ListedTickets pipeline={pipeline.name} create={create} table={display === 'table'} />;
};

/**
 * One pipeline's tickets at a time, the one the sidebar picked, under core's list bar: the filter
 * (`F`) on every field the old page filtered by, Sort, and Display, which groups them by status,
 * lays them on a board or shows a table. A ticket opens in core's side panel; Create ticket
 * drafts one there, in the shown pipeline.
 */
export const TicketsPage = () => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const [display] = useListDisplay(LIST, DISPLAYS);
  const pipeline = useTicketPipeline();
  const create = () => openNew(TICKET_TYPE, { pipelineId: pipeline?.id });

  return (
    <PageContainer>
      <TicketsHeader pipeline={pipeline?.name} canCreate={Boolean(pipeline)} create={create} />
      <ViewBar allLabel={t('all-tickets', 'All tickets')}>
        <ListFilter
          id={LIST}
          fields={useTicketFields()}
          members={memberQueries}
          tags={ticketTags}
          totalCount={useTicketCount()}
        >
          <SortMenu />
          <DisplayMenu list={LIST} displays={DISPLAYS} />
        </ListFilter>
      </ViewBar>
      <QueryBoundary fallback={<RecordList.Skeleton />}>
        <TicketsBody display={display} create={create} />
      </QueryBoundary>
    </PageContainer>
  );
};
