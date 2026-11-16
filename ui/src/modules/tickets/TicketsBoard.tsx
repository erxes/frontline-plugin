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
import { useMutation } from '@tanstack/react-query';
import { IconCalendarX, IconPlus } from '@tabler/icons-react';
import { Button, cn, DragHandle, useFormat, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { usePriorityNames } from '@/pipelines/queries.ts';
import { StageIcon } from '@/pipelines/StatusRow.tsx';
import { orpc } from '~/orpc.ts';
import { TICKET_TYPE } from '~/plugin.ts';
import { MemberLine } from '~/shared/MemberLine.tsx';
import { SlaBadge } from './SlaBadge.tsx';
import { PriorityIcon, TicketMenu, TicketName } from './TicketCells.tsx';
import { TicketTags } from './TicketLinks.tsx';
import { useStatusGroups } from './TicketList.tsx';
import { type Ticket, useTicketChange } from './queries.ts';

type Group = ReturnType<typeof useStatusGroups>[number];

/**
 * A ticket on the board, laid out as the old board's card: its name and number, then its
 * priority, SLA and tags, then its target date and assignee. The handle drags it to another
 * status of its pipeline.
 */
const TicketCard = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const priorities = usePriorityNames();
  const format = useFormat();

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
        'sortable flex flex-col gap-2 rounded-lg border bg-background p-1.5 text-xs shadow-xs',
        isDragging && 'relative z-10 shadow-md',
      )}
    >
      <div className="flex items-center gap-0.5">
        <DragHandle
          aria-label={t('move-ticket', 'Move {{name}}', { name: ticket.name })}
          {...attributes}
          {...listeners}
        />
        <span className="flex min-w-0 flex-1">
          <TicketName ticket={ticket} />
        </span>
        <TicketMenu ticket={ticket} />
      </div>
      <div className="flex flex-wrap items-center gap-2 px-2">
        <span
          className="flex items-center gap-1 text-muted-foreground"
          title={priorities[ticket.priority]}
        >
          <PriorityIcon priority={ticket.priority} />
          {priorities[ticket.priority]}
        </span>
        <SlaBadge ticket={ticket} />
        <TicketTags tagIds={ticket.tagIds} />
      </div>
      {(ticket.targetDate ?? ticket.assigneeId) && (
        <div className="flex items-center justify-between gap-2 border-t px-2 pt-1.5 text-muted-foreground">
          {ticket.targetDate ? (
            <span className="flex items-center gap-1">
              <IconCalendarX className="size-3.5" />
              {format.date(ticket.targetDate)}
            </span>
          ) : (
            <span />
          )}
          {ticket.assigneeId && <MemberLine id={ticket.assigneeId} size="sm" />}
        </div>
      )}
    </li>
  );
};

/**
 * One status's tickets, where a card of the same pipeline drops to move there. Its header adds a
 * ticket in that status; an empty column says so.
 */
const Column = ({ group: { status, label, rows } }: { group: Group }) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const { active } = useDndContext();
  const accepts = active?.data.current?.pipelineId === status.pipelineId;
  const { setNodeRef, isOver } = useDroppable({ id: status.id, disabled: !accepts });

  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`column-${status.id}`}
      className={cn(
        'flex w-72 shrink-0 flex-col gap-2 overflow-y-auto rounded-lg bg-muted p-2',
        isOver && accepts && 'ring-2 ring-primary',
      )}
    >
      <header className="flex items-center gap-2 px-1">
        <StageIcon type={status.type} color={status.color} />
        <h2 id={`column-${status.id}`} className="truncate text-sm font-semibold">
          {label}
        </h2>
        <span className="text-xs text-muted-foreground">{rows.length}</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto"
          aria-label={t('add-ticket-to', 'Add a ticket to {{status}}', { status: label })}
          onClick={() =>
            openNew(TICKET_TYPE, { pipelineId: status.pipelineId, statusId: status.id })
          }
        >
          <IconPlus />
        </Button>
      </header>
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rows.map((ticket) => (
            <TicketCard key={ticket.id} ticket={ticket} />
          ))}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
          {t('no-tickets-in-status', 'No tickets here')}
        </p>
      )}
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
