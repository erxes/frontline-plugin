import { memberQueries } from '@erxes/core-contract/client';
import {
  IconLayoutKanban,
  IconList,
  IconSortAscending,
  IconSortDescending,
  IconTicket,
} from '@tabler/icons-react';
import {
  Button,
  buttonVariants,
  PageContainer,
  PageHeader,
  RecordTable,
  Select,
  SelectMember,
  ToggleGroup,
} from 'erxes-ui';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CreateButton, ListEmpty, SearchSubHeader } from '../shared/List.tsx';
import { PagedRows } from '../shared/Table.tsx';
import { CreateTicketSheet } from './CreateTicketSheet.tsx';
import { TicketsBoard } from './TicketsBoard.tsx';
import { TicketsCommandBar } from './TicketsCommandBar.tsx';
import { useTicketColumns } from './TicketsTable.tsx';
import {
  ALL,
  ChannelSelect,
  PipelineSelect,
  PrioritySelect,
  StatusSelect,
} from './TicketFields.tsx';
import { TICKETS_PATH } from '../paths.ts';
import {
  ticketSort,
  ticketSortDirection,
  ticketView,
  UNASSIGNED,
  useTicketFilters,
  useTicketPanel,
  useTickets,
} from './useTickets.ts';

/** Narrows the tickets to a channel, its pipeline and status, an assignee, a priority and a state. */
const TicketFilters = () => {
  const { t } = useTranslation('frontline');
  const [filters, setFilters] = useTicketFilters();

  return (
    <>
      <ChannelSelect
        value={filters.channelId}
        onChange={(channelId) => void setFilters({ channelId, pipelineId: null, statusId: null })}
        all={t('all-channels', 'All channels')}
        className="w-40"
      />
      <PipelineSelect
        channelId={filters.channelId ?? ''}
        value={filters.pipelineId}
        onChange={(pipelineId) => void setFilters({ pipelineId, statusId: null })}
        all={t('all-pipelines', 'All pipelines')}
        className="w-40"
      />
      <StatusSelect
        pipelineId={filters.pipelineId ?? ''}
        value={filters.statusId}
        onChange={(statusId) => void setFilters({ statusId })}
        all={t('all-statuses', 'All statuses')}
        className="w-40"
      />
      <div className="w-44">
        <SelectMember.Field
          value={filters.assignee === UNASSIGNED ? null : filters.assignee}
          onValueChange={(assignee) => void setFilters({ assignee: assignee ?? UNASSIGNED })}
          members={memberQueries}
          noneLabel={t('no-assignee', 'No assignee')}
          placeholder={
            filters.assignee === UNASSIGNED
              ? t('no-assignee', 'No assignee')
              : t('any-assignee', 'Any assignee')
          }
        />
      </div>
      {filters.assignee && (
        <Button variant="ghost" onClick={() => void setFilters({ assignee: null })}>
          {t('any-assignee', 'Any assignee')}
        </Button>
      )}
      <PrioritySelect
        value={filters.priority}
        onChange={(priority) => void setFilters({ priority })}
        all={t('all-priorities', 'All priorities')}
        className="w-36"
      />
      <Select
        value={filters.state ?? 'active'}
        onValueChange={(state) =>
          void setFilters({ state: state === 'archived' || state === ALL ? state : null })
        }
      >
        <Select.Trigger variant="bordered" aria-label={t('state', 'State')} className="w-32">
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="active">{t('active', 'Active')}</Select.Item>
          <Select.Item value="archived">{t('archived', 'Archived')}</Select.Item>
          <Select.Item value={ALL}>{t('all', 'All')}</Select.Item>
        </Select.Content>
      </Select>
    </>
  );
};

/** List or board, and the field and direction the tickets sort by. */
const ViewControls = () => {
  const { t } = useTranslation('frontline');
  const [view, setView] = useAtom(ticketView);
  const [sort, setSort] = useAtom(ticketSort);
  const [direction, setDirection] = useAtom(ticketSortDirection);

  return (
    <>
      <Select
        value={sort}
        onValueChange={(next) => setSort(next === 'createdAt' ? 'createdAt' : 'updatedAt')}
      >
        <Select.Trigger variant="bordered" aria-label={t('sort-by', 'Sort by')} className="w-36">
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="updatedAt">{t('updated-at', 'Updated at')}</Select.Item>
          <Select.Item value="createdAt">{t('created-at', 'Created at')}</Select.Item>
        </Select.Content>
      </Select>
      <Button
        variant="ghost"
        size="icon"
        aria-label={
          direction === -1 ? t('newest-first', 'Newest first') : t('oldest-first', 'Oldest first')
        }
        onClick={() => setDirection(direction === -1 ? 1 : -1)}
      >
        {direction === -1 ? <IconSortDescending /> : <IconSortAscending />}
      </Button>
      <ToggleGroup
        value={[view]}
        onValueChange={([next]) => next && setView(next === 'grid' ? 'grid' : 'list')}
        aria-label={t('view', 'View')}
      >
        <ToggleGroup.Item value="list" aria-label={t('list', 'List')}>
          <IconList />
        </ToggleGroup.Item>
        <ToggleGroup.Item value="grid" aria-label={t('board', 'Board')}>
          <IconLayoutKanban />
        </ToggleGroup.Item>
      </ToggleGroup>
    </>
  );
};

/** The tickets as a table a page at a time, with edits in place and bulk changes. */
const TicketsList = ({ order }: { order: Parameters<typeof useTickets>[0] }) => {
  const { t } = useTranslation('frontline');
  const columns = useTicketColumns();
  const { open } = useTicketPanel();
  const { tickets, totalCount, isPending, error, hasNextPage, fetchNextPage } = useTickets(order);

  return (
    <>
      <SearchSubHeader id="frontline-tickets-filter" count={totalCount}>
        <TicketFilters />
      </SearchSubHeader>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : !isPending && tickets.length === 0 ? (
        <ListEmpty
          icon={<IconTicket />}
          title={t('no-tickets-yet', 'No tickets yet')}
          description={t('no-tickets-description', 'Create a ticket in one of your pipelines.')}
          action={
            <Button onClick={() => open('new')}>{t('create-ticket', 'Create ticket')}</Button>
          }
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_tickets"
          columns={columns}
          data={tickets}
          stickyColumns={['more', 'checkbox', 'name']}
          className="m-3"
        >
          <PagedRows
            isPending={isPending}
            hasNextPage={hasNextPage}
            count={tickets.length}
            fetchNextPage={() => void fetchNextPage()}
          />
          <TicketsCommandBar tickets={tickets} />
        </RecordTable.Provider>
      )}
    </>
  );
};

/** Every ticket the member's channels hold: the list or the board, filters in the query string. */
export const TicketsPage = () => {
  const { t } = useTranslation('frontline');
  const { open } = useTicketPanel();
  const [view] = useAtom(ticketView);
  const [sort] = useAtom(ticketSort);
  const [direction] = useAtom(ticketSortDirection);
  const order = { sort, direction };

  return (
    <PageContainer>
      <PageHeader>
        <PageHeader.Start>
          <Link to={TICKETS_PATH} className={buttonVariants({ variant: 'ghost' })}>
            <IconTicket />
            {t('tickets', 'Tickets')}
          </Link>
        </PageHeader.Start>
        <PageHeader.End>
          <ViewControls />
          <CreateButton
            allowed
            label={t('create-ticket', 'Create ticket')}
            onClick={() => open('new')}
          />
        </PageHeader.End>
      </PageHeader>
      {view === 'grid' ? (
        <>
          <SearchSubHeader id="frontline-tickets-board-filter" count={undefined}>
            <TicketFilters />
          </SearchSubHeader>
          <TicketsBoard order={order} />
        </>
      ) : (
        <TicketsList order={order} />
      )}
      <CreateTicketSheet />
    </PageContainer>
  );
};
