import { memberQueries } from '@erxes/core-contract/client';
import {
  IconAlertSquareRounded,
  IconArchive,
  IconCalendarUp,
  IconExternalLink,
  IconHash,
  IconLabelFilled,
  IconProgressCheck,
  IconRestore,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  SelectMember,
} from 'erxes-ui';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { orpc } from '../orpc.ts';
import { type RowAction, RowActions } from '../shared/Records.tsx';
import { DateCell } from '../shared/Table.tsx';
import { PrioritySelect, StatusSelect } from './TicketFields.tsx';
import { useCanDelete, useDeleteTickets } from './useTicketDeletes.ts';
import { type Ticket, ticketPath, useTicketChange } from './useTickets.ts';

/** Changes one ticket from its row, card or page. */
export const useUpdateTicket = () =>
  useMutation(orpc.tickets.update.mutationOptions(useTicketChange()));

/** Moves one ticket to another status of its pipeline. */
export const useMoveTicket = () =>
  useMutation(orpc.tickets.move.mutationOptions(useTicketChange()));

/** Archives or unarchives the ticket, and deletes it for its channel's admins; `onDeleted` runs after. */
export const useTicketActions = (ticket: Ticket, onDeleted?: () => void): RowAction[] => {
  const { t } = useTranslation('frontline');
  const update = useUpdateTicket();
  const canDelete = useCanDelete();
  const { deleteTickets } = useDeleteTickets();
  const archived = ticket.state === 'archived';

  return [
    {
      value: 'archive',
      icon: archived ? <IconRestore /> : <IconArchive />,
      label: archived ? t('unarchive', 'Unarchive') : t('archive', 'Archive'),
      onSelect: () => update.mutate({ id: ticket.id, state: archived ? 'active' : 'archived' }),
    },
    ...(canDelete(ticket)
      ? [
          {
            value: 'delete',
            icon: <IconTrash />,
            label: t('delete', 'Delete'),
            onSelect: () => void deleteTickets([ticket.id], onDeleted),
          },
        ]
      : []),
  ];
};

const MoreCell = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const actions = useTicketActions(ticket);

  return (
    <RowActions
      label={t('ticket-actions', 'Actions for {{name}}', { name: ticket.name })}
      actions={[
        {
          value: 'open',
          icon: <IconExternalLink />,
          label: t('open', 'Open'),
          onSelect: () => void navigate(ticketPath(ticket.id)),
        },
        ...actions,
      ]}
    />
  );
};

/** The ticket's status; picking another moves it. */
export const StatusCell = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const move = useMoveTicket();

  return (
    <StatusSelect
      pipelineId={ticket.pipelineId}
      value={ticket.statusId}
      onChange={(statusId) => statusId && move.mutate({ id: ticket.id, statusId })}
      variant="flush"
      label={t('status-of', 'Status of {{name}}', { name: ticket.name })}
    />
  );
};

export const PriorityCell = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const update = useUpdateTicket();

  return (
    <PrioritySelect
      value={ticket.priority}
      onChange={(priority) => update.mutate({ id: ticket.id, priority: priority ?? 0 })}
      variant="flush"
      label={t('priority-of', 'Priority of {{name}}', { name: ticket.name })}
    />
  );
};

const AssigneeCell = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const update = useUpdateTicket();

  return (
    <SelectMember.InlineCell
      value={ticket.assigneeId}
      onValueChange={(assigneeId) => update.mutate({ id: ticket.id, assigneeId })}
      members={memberQueries}
      noneLabel={t('no-assignee', 'No assignee')}
      placeholder={t('assignee', 'Assignee')}
      aria-label={t('assignee-of', 'Assignee of {{name}}', { name: ticket.name })}
    />
  );
};

const column = (
  id: string,
  label: string,
  icon: ComponentProps<typeof RecordTable.InlineHead>['icon'],
  size: number,
  render: (ticket: Ticket) => ReactNode,
): RecordTableColumnDef<Ticket> => ({
  id,
  header: () => <RecordTable.InlineHead label={label} icon={icon} />,
  cell: ({ row }) => render(row.original),
  size,
});

/** The list's columns: what a ticket is, where it stands and who has it. */
export const useTicketColumns = (): RecordTableColumnDef<Ticket>[] => {
  const { t } = useTranslation('frontline');

  return [
    { id: 'more', cell: ({ row }) => <MoreCell ticket={row.original} />, size: 33 },
    RecordTable.checkboxColumnOf<Ticket>(),
    column('name', t('name', 'Name'), IconLabelFilled, 300, (ticket) => (
      <RecordTableInlineCell>
        <Link to={ticketPath(ticket.id)} className="truncate hover:underline">
          {ticket.name}
        </Link>
      </RecordTableInlineCell>
    )),
    column('number', t('number', 'Number'), IconHash, 140, (ticket) => (
      <RecordTableInlineCell>
        <span className="text-muted-foreground truncate">{ticket.number}</span>
      </RecordTableInlineCell>
    )),
    column('status', t('status', 'Status'), IconProgressCheck, 180, (ticket) => (
      <RecordTableInlineCell>
        <StatusCell ticket={ticket} />
      </RecordTableInlineCell>
    )),
    column('priority', t('priority', 'Priority'), IconAlertSquareRounded, 140, (ticket) => (
      <RecordTableInlineCell>
        <PriorityCell ticket={ticket} />
      </RecordTableInlineCell>
    )),
    column('assignee', t('assignee', 'Assignee'), IconUser, 200, (ticket) => (
      <AssigneeCell ticket={ticket} />
    )),
    column('updatedAt', t('updated-at', 'Updated at'), IconCalendarUp, 140, (ticket) => (
      <DateCell date={ticket.updatedAt} />
    )),
  ];
};
