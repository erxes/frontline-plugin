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
import { ListSelectionBar, SelectionBar } from '~/shared/Records.tsx';
import { TicketBulkActions } from './TicketBulkActions.tsx';
import { ticketTags } from './TicketLinks.tsx';
import { SortMenu, useTicketFields } from './TicketFilter.tsx';
import { TicketList } from './TicketList.tsx';
import { TicketsBoard } from './TicketsBoard.tsx';
import { TicketsTable } from './TicketsTable.tsx';
import { type Ticket, useTicketPipeline, useTickets } from './queries.ts';

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
  const canCreate = Boolean(pipeline);
  const create = () => openNew(TICKET_TYPE, { pipelineId: pipeline?.id });

  const list = useTickets();
  const { rows: tickets, totalCount, isPending, error } = list;

  return (
    <PageContainer>
      <TicketsHeader pipeline={pipeline?.name} canCreate={canCreate} create={create} />
      <ViewBar allLabel={t('all-tickets', 'All tickets')}>
        <ListFilter
          id={LIST}
          fields={useTicketFields()}
          members={memberQueries}
          tags={ticketTags}
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
          title={
            pipeline
              ? t('no-tickets-in', 'No tickets in {{pipeline}} yet', { pipeline: pipeline.name })
              : t('no-tickets-yet', 'No tickets yet')
          }
          description={
            pipeline
              ? t('no-tickets-in-description', 'Create one here, or pick another pipeline.')
              : t('no-ticket-pipelines', 'A channel admin adds pipelines in its settings.')
          }
          action={
            canCreate && <Button onClick={create}>{t('create-ticket', 'Create ticket')}</Button>
          }
        />
      ) : display === 'table' ? (
        <TicketsTable tickets={tickets} paging={list}>
          <SelectionBar>{bulkOf(tickets)}</SelectionBar>
        </TicketsTable>
      ) : display === 'board' ? (
        <>
          <LoadPage paging={list} newer />
          <TicketsBoard tickets={tickets} />
          <LoadPage paging={list} />
        </>
      ) : (
        <RecordList.Provider listId={LIST}>
          <LoadPage paging={list} newer />
          {isPending ? <RecordList.Skeleton /> : <TicketList tickets={tickets} />}
          <LoadPage paging={list} />
          <ListSelectionBar shown={tickets.map((ticket) => ticket.id)}>
            {bulkOf(tickets)}
          </ListSelectionBar>
        </RecordList.Provider>
      )}
    </PageContainer>
  );
};
