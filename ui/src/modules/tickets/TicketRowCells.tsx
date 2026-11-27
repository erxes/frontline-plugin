import { IconCalendar } from '@tabler/icons-react';
import { cn, DateField, toIsoDay, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { PRIORITIES, usePriorityNames } from '@/pipelines/queries.ts';
import { StageIcon } from '@/pipelines/StageIcon.tsx';
import { TICKET_TYPE } from '~/plugin.ts';
import { MemberAvatarPicker } from '~/shared/MemberPicker.tsx';
import { RowPicker } from '~/shared/Pickers.tsx';
import { usePrefetch } from '~/shared/prefetch.ts';
import { PriorityIcon } from './TicketCells.tsx';
import { prefetchTicket, type TicketRow, type TicketRowActions, useChoices } from './queries.ts';

// A row of the list display, drawn as Operation draws a task row: each property a quiet button
// that changes it in place.

/**
 * A list row's name, which opens the ticket in core's side panel; pointing at it loads the panel
 * first. Its number is part of its name, as the row's number column is only drawn.
 */
export const TicketRowName = ({ ticket }: { ticket: TicketRow }) => {
  const { open } = useOpenRecord();
  const prefetch = usePrefetch(prefetchTicket);

  return (
    <button
      type="button"
      data-ticket-row={ticket.id}
      className="min-w-0 flex-1 truncate rounded-sm px-1 text-left text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => open({ contentType: TICKET_TYPE, contentId: ticket.id })}
      {...prefetch(ticket.id)}
    >
      {ticket.number && <span className="sr-only">{ticket.number} </span>}
      {ticket.name}
    </button>
  );
};

/** A list row's status as its stage's icon; picking another moves the ticket to that group. */
export const StatusRowPicker = ({ ticket, act }: { ticket: TicketRow; act: TicketRowActions }) => {
  const { t } = useTranslation('frontline');

  const statuses = useChoices().statuses.filter(
    (status) => status.pipelineId === ticket.pipelineId,
  );

  return (
    <RowPicker
      label={t('status-of', 'Status of {{name}}', { name: ticket.name })}
      iconOnly
      disabled={!ticket.canMove}
      value={ticket.statusId}
      onChange={(statusId) => act.edit(ticket.id, { statusId })}
      options={statuses.map((status) => ({
        value: status.id,
        label: status.name,
        icon: <StageIcon type={status.type} color={status.color} />,
      }))}
    />
  );
};

/** A list row's priority as its icon, critical as a filled alert. */
export const PriorityRowPicker = ({
  ticket,
  act,
}: {
  ticket: TicketRow;
  act: TicketRowActions;
}) => {
  const { t } = useTranslation('frontline');
  const names = usePriorityNames();

  return (
    <RowPicker
      label={t('priority-of', 'Priority of {{name}}', { name: ticket.name })}
      iconOnly
      value={String(ticket.priority)}
      onChange={(next) =>
        act.edit(ticket.id, {
          priority: PRIORITIES.find((priority) => String(priority) === next) ?? 0,
        })
      }
      options={PRIORITIES.map((priority) => ({
        value: String(priority),
        label: names[priority] ?? '',
        icon: <PriorityIcon priority={priority} />,
      }))}
    />
  );
};

/** A list row's assignee as their avatar; picking another reassigns the ticket. */
export const AssigneeRowPicker = ({
  ticket,
  act,
}: {
  ticket: TicketRow;
  act: TicketRowActions;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <MemberAvatarPicker
      value={ticket.assigneeId}
      onValueChange={(assigneeId) => act.edit(ticket.id, { assigneeId })}
      noneLabel={t('no-assignee', 'No assignee')}
      label={(name) =>
        name
          ? t('assignee-of-is', 'Assignee of {{ticket}}: {{name}}', { ticket: ticket.name, name })
          : t('assignee-of', 'Assignee of {{name}}', { name: ticket.name })
      }
    />
  );
};

/** Resolved, closed and cancelled: the stages from 4 on (`useStages`). */
const FIRST_DONE_STAGE = 4;

/** Not done and its target day has passed: due today isn't late yet. */
const overdue = (ticket: TicketRow, stage: number | undefined) =>
  ticket.targetDate !== null &&
  (stage ?? 0) < FIRST_DONE_STAGE &&
  toIsoDay(ticket.targetDate) < toIsoDay(new Date());

/** A day the picker saved, as that local day's midnight. */
const fromIsoDay = (day: string | null) => (day ? new Date(`${day}T00:00:00`) : null);

/** A list row's target date, picked in place; an empty one shows on hover, a late one in red. */
export const TargetDateRowPicker = ({
  ticket,
  act,
}: {
  ticket: TicketRow;
  act: TicketRowActions;
}) => {
  const { t } = useTranslation('frontline');
  const status = useChoices().statuses.find((each) => each.id === ticket.statusId);

  return (
    <span
      className={cn(
        'flex w-32 shrink-0 items-center justify-end',
        !ticket.targetDate &&
          'opacity-0 group-hover/list-row:opacity-100 group-focus-within/list-row:opacity-100',
      )}
    >
      <DateField
        aria-label={t('target-date-of', 'Target date of {{name}}', { name: ticket.name })}
        variant="field"
        value={ticket.targetDate ? toIsoDay(ticket.targetDate) : null}
        min={ticket.startDate ? toIsoDay(ticket.startDate) : undefined}
        placeholder={t('target-date', 'Target date')}
        onSave={(day) => act.edit(ticket.id, { targetDate: fromIsoDay(day) })}
      >
        <IconCalendar
          aria-hidden
          className={overdue(ticket, status?.type) ? 'text-destructive' : undefined}
        />
      </DateField>
    </span>
  );
};
