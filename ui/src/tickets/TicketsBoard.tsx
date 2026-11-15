import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { memberQueries } from '@erxes/core-contract/client';
import { IconLayoutKanban } from '@tabler/icons-react';
import { Badge, Button, cn, DragHandle, MemberInline, Skeleton } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { type Status, usePriorityName, useStatuses } from '../pipelines/queries.ts';
import { StatusIcon } from '../pipelines/StatusIcon.tsx';
import { ListEmpty } from '../shared/List.tsx';
import { useMoveTicket } from './TicketsTable.tsx';
import { type Ticket, ticketPath, useTicketFilters, useTickets } from './useTickets.ts';

type Order = Parameters<typeof useTickets>[0];

/** A ticket on the board; its handle drags it to another column. */
const TicketCard = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const nameOf = usePriorityName();

  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: ticket.id,
  });

  // erxes-ui's `sortable` utility reads the drag from this variable.
  const cssVariables = { '--sortable-transform': CSS.Translate.toString(transform) };

  return (
    <li
      ref={setNodeRef}
      style={cssVariables}
      className={cn(
        'sortable flex items-start gap-2 rounded-md border bg-background p-2',
        isDragging && 'relative z-10 shadow-md',
      )}
    >
      <DragHandle
        aria-label={t('move-ticket', 'Move {{name}}', { name: ticket.name })}
        {...attributes}
        {...listeners}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        {ticket.number && <span className="text-xs text-muted-foreground">{ticket.number}</span>}
        <Link to={ticketPath(ticket.id)} className="truncate text-sm font-medium hover:underline">
          {ticket.name}
        </Link>
        <div className="flex items-center gap-2">
          {ticket.priority > 0 && <Badge variant="secondary">{nameOf(ticket.priority)}</Badge>}
          {ticket.assigneeId && (
            <MemberInline memberId={ticket.assigneeId} members={memberQueries} size="sm" />
          )}
        </div>
      </div>
    </li>
  );
};

/** One status's tickets, a page at a time, where cards drop to move there. */
const Column = ({ status, order }: { status: Status; order: Order }) => {
  const { t } = useTranslation('frontline');
  const { setNodeRef, isOver } = useDroppable({ id: status.id });

  const { tickets, totalCount, isPending, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useTickets(order, status.id);

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`column-${status.id}`}
      className={cn(
        'flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted p-2',
        isOver && 'ring-2 ring-primary',
      )}
    >
      <header className="flex items-center gap-2 px-1">
        <StatusIcon type={status.type} color={status.color} />
        <h2 id={`column-${status.id}`} className="truncate text-sm font-semibold">
          {status.name}
        </h2>
        <span className="text-xs text-muted-foreground">{totalCount}</span>
      </header>
      {isPending ? (
        <Skeleton className="h-20" />
      ) : (
        <ul className="flex flex-col gap-2">
          {tickets.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </ul>
      )}
      {hasNextPage && (
        <Button variant="ghost" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {t('load-more', 'Load more')}
        </Button>
      )}
    </section>
  );
};

/** The pipeline's tickets in a column per status; dropping a card on a column moves it there. */
export const TicketsBoard = ({ order }: { order: Order }) => {
  const { t } = useTranslation('frontline');
  const [{ pipelineId, statusId }] = useTicketFilters();
  const { data: statuses } = useStatuses(pipelineId ?? '');
  const move = useMoveTicket();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  if (!pipelineId)
    return (
      <ListEmpty
        icon={<IconLayoutKanban />}
        title={t('pick-a-pipeline', 'Pick a pipeline')}
        description={t(
          'board-needs-pipeline',
          'The board shows one pipeline, a column per status.',
        )}
      />
    );

  if (!statuses) return <Skeleton className="m-3 h-60" />;

  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (over) move.mutate({ id: String(active.id), statusId: String(over.id) });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={dragEnd}>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {statuses
          .filter((status) => !statusId || status.id === statusId)
          .map((status) => (
            <Column key={status.id} status={status} order={order} />
          ))}
      </div>
    </DndContext>
  );
};
