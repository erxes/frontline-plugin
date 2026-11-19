import {
  IconAlarm,
  IconAlertSquareRounded,
  IconCalendarBolt,
  IconCalendarPlus,
  IconCalendarUp,
  IconCalendarX,
  IconGitBranch,
  IconLabelFilled,
  IconProgressCheck,
  IconUser,
  IconUserCircle,
} from '@tabler/icons-react';
import { RecordTable, type RecordTableColumnDef, RecordTableInlineCell } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { MemberLine } from '~/shared/Person.tsx';
import { RowActions } from '~/shared/Records.tsx';
import type { Paging } from '~/shared/paging.ts';
import { column as columnOf, DateCell, PagedRows } from '~/shared/Table.tsx';
import {
  AssigneeCell,
  PriorityCell,
  StatusCell,
  TicketName,
  useTicketActions,
} from './TicketCells.tsx';
import { SlaBadge } from './SlaBadge.tsx';
import {
  type TicketRow,
  type TicketRowActions,
  useChoices,
  useTicketRowActions,
} from './queries.ts';

const column = columnOf<TicketRow>;

const MoreCell = ({ ticket, act }: { ticket: TicketRow; act: TicketRowActions }) => {
  const { t } = useTranslation('frontline');

  return (
    <RowActions
      label={t('ticket-actions', 'Actions for {{name}}', { name: ticket.name })}
      actions={useTicketActions(ticket, act)}
    />
  );
};

const PipelineCell = ({ ticket }: { ticket: TicketRow }) => {
  const { pipelines } = useChoices();

  return (
    <RecordTableInlineCell>
      <span className="truncate">
        {pipelines.find((pipeline) => pipeline.id === ticket.pipelineId)?.name}
      </span>
    </RecordTableInlineCell>
  );
};

/** A date the ticket may not have. */
const MaybeDate = ({ date }: { date: Date | null }) =>
  date ? <DateCell date={date} /> : <RecordTableInlineCell />;

/** What a ticket is, where it stands, who has it and when. */
const useColumns = (): RecordTableColumnDef<TicketRow>[] => {
  const { t } = useTranslation('frontline');
  const act = useTicketRowActions();

  return [
    {
      id: 'more',
      header: () => <RecordTable.ColumnSelector />,
      cell: ({ row }) => <MoreCell ticket={row.original} act={act} />,
      size: 33,
    },
    RecordTable.checkboxColumnOf<TicketRow>(),
    column('name', t('name', 'Name'), IconLabelFilled, 320, (ticket) => (
      <RecordTableInlineCell>
        <TicketName ticket={ticket} />
      </RecordTableInlineCell>
    )),
    column('status', t('status', 'Status'), IconProgressCheck, 180, (ticket) => (
      <RecordTableInlineCell>
        <StatusCell ticket={ticket} act={act} />
      </RecordTableInlineCell>
    )),
    column('priority', t('priority', 'Priority'), IconAlertSquareRounded, 140, (ticket) => (
      <RecordTableInlineCell>
        <PriorityCell ticket={ticket} act={act} />
      </RecordTableInlineCell>
    )),
    column('assignee', t('assignee', 'Assignee'), IconUser, 200, (ticket) => (
      <AssigneeCell ticket={ticket} act={act} />
    )),
    column('sla', t('sla', 'SLA'), IconAlarm, 180, (ticket) => (
      <RecordTableInlineCell>
        <SlaBadge ticket={ticket} />
      </RecordTableInlineCell>
    )),
    column('pipeline', t('pipeline', 'Pipeline'), IconGitBranch, 160, (ticket) => (
      <PipelineCell ticket={ticket} />
    )),
    column('startDate', t('start-date', 'Start date'), IconCalendarBolt, 130, (ticket) => (
      <MaybeDate date={ticket.startDate} />
    )),
    column('targetDate', t('target-date', 'Target date'), IconCalendarX, 130, (ticket) => (
      <MaybeDate date={ticket.targetDate} />
    )),
    column('createdBy', t('created-by', 'Created by'), IconUserCircle, 180, (ticket) => (
      <RecordTableInlineCell>
        <MemberLine id={ticket.createdBy} />
      </RecordTableInlineCell>
    )),
    column('createdAt', t('created-at', 'Created at'), IconCalendarPlus, 130, (ticket) => (
      <DateCell date={ticket.createdAt} />
    )),
    column('updatedAt', t('updated-at', 'Updated at'), IconCalendarUp, 130, (ticket) => (
      <DateCell date={ticket.updatedAt} />
    )),
  ];
};

/** The tickets as a table a page at a time, edited in place; `children` is its selection bar. */
export const TicketsTable = ({
  tickets,
  paging,
  children,
}: {
  tickets: TicketRow[];
  paging: Paging;
  children: ReactNode;
}) => (
  <RecordTable.Provider
    tableId="frontline_tickets"
    columns={useColumns()}
    data={tickets}
    stickyColumns={['more', 'checkbox', 'name']}
    className="m-3"
  >
    <PagedRows paging={paging} count={tickets.length} />
    {children}
  </RecordTable.Provider>
);
