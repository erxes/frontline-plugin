import { IconCalendarX } from '@tabler/icons-react';
import { Board, type BoardMove, useFormat, useOpenRecord } from 'erxes-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { TICKET_TYPE } from '~/plugin.ts';
import { SlaBadge } from './SlaBadge.tsx';
import { AssigneeCell, PriorityCell, TicketMenu } from './TicketCells.tsx';
import { TicketTags } from './TicketLinks.tsx';
import { TicketPropertyBadges } from './TicketProperties.tsx';
import { usePipelineStatuses } from './TicketList.tsx';
import { type Ticket, type TicketRowActions, useTicketRowActions, useTickets } from './queries.ts';

type Status = ReturnType<typeof usePipelineStatuses>[number];

/**
 * A ticket on the board, as the old board's card: its number and name, its target date, SLA,
 * tags and properties, and under them its priority and assignee, each changed on the card.
 * Drag it anywhere on it to another status; click it to open it.
 */
const TicketCard = ({ ticket, act }: { ticket: Ticket; act: TicketRowActions }) => {
  const format = useFormat();
  const { open } = useOpenRecord();

  return (
    <Board.Card
      id={ticket.id}
      title={ticket.name}
      onOpen={() => open({ contentType: TICKET_TYPE, contentId: ticket.id })}
      footer={
        <div className="flex min-w-0 items-center gap-1 text-xs">
          <PriorityCell ticket={ticket} act={act} />
          <span className="min-w-0 flex-1">
            <AssigneeCell ticket={ticket} act={act} />
          </span>
          <TicketMenu ticket={ticket} act={act} />
        </div>
      }
    >
      <span className="line-clamp-2 text-sm font-medium">
        {ticket.number && (
          <span className="mr-1.5 font-normal text-muted-foreground">{ticket.number}</span>
        )}
        {ticket.name}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs empty:hidden">
        {ticket.targetDate && (
          <span className="flex items-center gap-1 text-muted-foreground">
            <IconCalendarX className="size-3.5" />
            {format.date(ticket.targetDate)}
          </span>
        )}
        <SlaBadge ticket={ticket} />
        <TicketTags tagIds={ticket.tagIds} max={3} />
      </span>
      <span className="empty:hidden">
        <TicketPropertyBadges ticket={ticket} />
      </span>
    </Board.Card>
  );
};

/** One status's tickets, a page at a time as it scrolls, with how many it holds. */
const StatusColumn = memo(function StatusColumn({ status }: { status: Status }) {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const column = useTickets(status.id);
  const act = useTicketRowActions();

  return (
    <Board.Column
      id={status.id}
      title={status.name}
      color={status.color ?? undefined}
      count={column.totalCount ?? '·'}
      add={{
        label: t('add-ticket-to', 'Add a ticket to {{status}}', { status: status.name }),
        onClick: () => openNew(TICKET_TYPE, { pipelineId: status.pipelineId, statusId: status.id }),
      }}
      loading={column.isPending}
      error={column.error?.message}
      empty={t('no-tickets-in-status', 'No tickets here')}
      pages={column}
    >
      {column.rows.map((ticket) => (
        <TicketCard key={ticket.id} ticket={ticket} act={act} />
      ))}
    </Board.Column>
  );
});

/**
 * The shown pipeline's tickets in a column per status, each its own paged list under the same
 * filter and sort as the other displays. A dropped card lands in its new column at once and moves
 * there; one the status refuses goes back with the refusal.
 */
export const TicketsBoard = () => {
  const statuses = usePipelineStatuses();
  const act = useTicketRowActions();

  const move = ({ id, columnId, fromColumnId }: BoardMove) => {
    if (columnId !== fromColumnId) act.edit(id, { statusId: columnId });
  };

  return (
    <Board onMove={move}>
      {statuses.map((status) => (
        <StatusColumn key={status.id} status={status} />
      ))}
    </Board>
  );
};
