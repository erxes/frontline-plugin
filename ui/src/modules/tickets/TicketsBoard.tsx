import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { memberQueries } from '@erxes/core-contract/client';
import { useMutation } from '@tanstack/react-query';
import { Badge, cn, DragHandle, MemberInline } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { usePriorityNames } from '@/pipelines/queries.ts';
import { StageIcon } from '@/pipelines/StatusRow.tsx';
import { orpc } from '~/orpc.ts';
import { SlaBadge } from './SlaBadge.tsx';
import { TicketMenu, TicketName } from './TicketCells.tsx';
import { useStatusGroups } from './TicketList.tsx';
import { type Ticket, useTicketChange } from './queries.ts';

type Group = ReturnType<typeof useStatusGroups>[number];

/** A ticket on the board; its handle drags it to another status of its pipeline. */
const TicketCard = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const priorities = usePriorityNames();

  const { setNodeRef, attributes, listeners, transform, isDragging } = useDraggable({
    id: ticket.id,
    data: { pipelineId: ticket.pipelineId },
  });

  // erxes-ui's `sortable` utility reads the drag from this variable.
  const cssVariables = { '--sortable-transform': CSS.Translate.toString(transform) };

  return (
    <li
      ref={setNodeRef}
      style={cssVariables}
      className={cn(
        'sortable flex items-start gap-1 rounded-md border bg-background p-2 text-xs',
        isDragging && 'relative z-10 shadow-md',
      )}
    >
      <DragHandle
        aria-label={t('move-ticket', 'Move {{name}}', { name: ticket.name })}
        {...attributes}
        {...listeners}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <TicketName ticket={ticket} />
        <div className="flex flex-wrap items-center gap-2 px-2">
          {ticket.priority > 0 && <Badge variant="secondary">{priorities[ticket.priority]}</Badge>}
          <SlaBadge ticket={ticket} />
          {ticket.assigneeId && (
            <MemberInline memberId={ticket.assigneeId} members={memberQueries} size="sm" />
          )}
        </div>
      </div>
      <TicketMenu ticket={ticket} />
    </li>
  );
};

/** One status's tickets, where a card of the same pipeline drops to move there. */
const Column = ({ group: { status, label, rows } }: { group: Group }) => {
  const { active } = useDndContext();
  const accepts = active?.data.current?.pipelineId === status.pipelineId;
  const { setNodeRef, isOver } = useDroppable({ id: status.id, disabled: !accepts });

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`column-${status.id}`}
      className={cn(
        'flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted p-2',
        isOver && accepts && 'ring-2 ring-primary',
      )}
    >
      <header className="flex items-center gap-2 px-1">
        <StageIcon type={status.type} color={status.color} />
        <h2 id={`column-${status.id}`} className="truncate text-sm font-semibold">
          {label}
        </h2>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
      </header>
      <ul className="flex flex-col gap-2">
        {rows.map((ticket) => (
          <TicketCard key={ticket.id} ticket={ticket} />
        ))}
      </ul>
    </section>
  );
};

/**
 * The shown tickets in a column per status of their pipelines, the same list and filter as the
 * other displays. Dropping a card on a column of its pipeline moves it there.
 */
export const TicketsBoard = ({ tickets }: { tickets: Ticket[] }) => {
  const groups = useStatusGroups(tickets);
  const update = useMutation(orpc.tickets.update.mutationOptions(useTicketChange()));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const dragEnd = ({ active, over }: DragEndEvent) => {
    if (over && !over.disabled) update.mutate({ id: String(active.id), statusId: String(over.id) });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragEnd={dragEnd}>
      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
        {groups.map((group) => (
          <Column key={group.status.id} group={group} />
        ))}
      </div>
    </DndContext>
  );
};
