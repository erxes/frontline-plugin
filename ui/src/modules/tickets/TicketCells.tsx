import {
  IconAlertSquareRoundedFilled,
  IconAntennaBars3,
  IconAntennaBars4,
  IconAntennaBars5,
  IconAntennaBarsOff,
  IconArchive,
  IconDots,
  IconRestore,
  IconTrash,
} from '@tabler/icons-react';
import { Button, cn, Select, useOpenRecord } from 'erxes-ui';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { PRIORITIES, usePriorityNames } from '@/pipelines/queries.ts';
import { StageIcon } from '@/pipelines/StageIcon.tsx';
import { TICKET_TYPE } from '~/plugin.ts';
import { MemberCell } from '~/shared/MemberPicker.tsx';
import { ActionsMenu, type RowAction } from '~/shared/Records.tsx';
import { type Ticket, type TicketRowActions, useChoices } from './queries.ts';

type Variant = ComponentProps<typeof Select.Trigger>['variant'];

/** The name opens the ticket in core's side panel, its number before it. */
export const TicketName = ({ ticket }: { ticket: Ticket }) => {
  const { open } = useOpenRecord();

  return (
    <Button
      variant="ghost"
      className="min-w-0 justify-start"
      onClick={() => open({ contentType: TICKET_TYPE, contentId: ticket.id })}
    >
      {ticket.number && <span className="text-muted-foreground">{ticket.number}</span>}
      <span className="truncate">{ticket.name}</span>
    </Button>
  );
};

/** A pipeline's statuses by stage, each with its stage's icon in its colour. */
export const StatusSelect = ({
  pipelineId,
  value,
  onChange,
  label,
  variant,
  disabled,
}: {
  pipelineId: string;
  value: string;
  onChange: (statusId: string) => void;
  label: string;
  variant?: Variant;
  disabled?: boolean;
}) => {
  const statuses = useChoices().statuses.filter((status) => status.pipelineId === pipelineId);

  return (
    <Select value={value} onValueChange={(next) => next && onChange(next)} disabled={disabled}>
      <Select.Trigger variant={variant} aria-label={label}>
        <Select.Value placeholder={label} />
      </Select.Trigger>
      <Select.Content>
        {statuses.map((status) => (
          <Select.Item key={status.id} value={status.id}>
            <span className="flex items-center gap-2">
              <StageIcon type={status.type} color={status.color} />
              {status.name}
            </span>
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};

const PRIORITY_ICONS: Record<number, typeof IconAntennaBarsOff> = {
  4: IconAlertSquareRoundedFilled,
  3: IconAntennaBars5,
  2: IconAntennaBars4,
  1: IconAntennaBars3,
  0: IconAntennaBarsOff,
};

/** A priority as the old ticket list drew it: signal bars, critical as a filled alert. */
const PriorityIcon = ({ priority }: { priority: number }) => {
  const Icon = PRIORITY_ICONS[priority] ?? IconAntennaBarsOff;

  return (
    <Icon
      className={cn(
        'size-4 shrink-0',
        priority === 4 ? 'text-destructive-text' : 'text-muted-foreground',
      )}
    />
  );
};

/** A priority's icon and name; `named` false leaves the name to the label. */
const PriorityLabel = ({ priority, named = true }: { priority: number; named?: boolean }) => {
  const name = usePriorityNames()[priority];

  return (
    <span className="flex items-center gap-2">
      <PriorityIcon priority={priority} />
      {named && name}
    </span>
  );
};

/**
 * The five priorities, critical to none. `quiet`, in a row, shows no priority as its icon alone,
 * so a list of unset ones doesn't repeat "No priority", and fits the trigger to it.
 */
export const PrioritySelect = ({
  value,
  onChange,
  label,
  variant,
  quiet,
}: {
  value: number;
  onChange: (priority: number) => void;
  label: string;
  variant?: Variant;
  quiet?: boolean;
}) => {
  return (
    <Select
      value={String(value)}
      onValueChange={(next) =>
        onChange(PRIORITIES.find((priority) => String(priority) === next) ?? 0)
      }
    >
      <Select.Trigger variant={variant} aria-label={label} className={quiet ? 'w-auto' : undefined}>
        <Select.Value>
          <PriorityLabel priority={value} named={!quiet || value > 0} />
        </Select.Value>
      </Select.Trigger>
      <Select.Content>
        {PRIORITIES.map((priority) => (
          <Select.Item key={priority} value={String(priority)}>
            <PriorityLabel priority={priority} />
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};

/** The ticket's status; picking another moves it. */
export const StatusCell = ({ ticket, act }: { ticket: Ticket; act: TicketRowActions }) => {
  const { t } = useTranslation('frontline');

  return (
    <StatusSelect
      pipelineId={ticket.pipelineId}
      value={ticket.statusId}
      onChange={(statusId) => act.edit(ticket.id, { statusId })}
      label={t('status-of', 'Status of {{name}}', { name: ticket.name })}
      variant="flush"
      disabled={!ticket.canMove}
    />
  );
};

export const PriorityCell = ({ ticket, act }: { ticket: Ticket; act: TicketRowActions }) => {
  const { t } = useTranslation('frontline');

  return (
    <PrioritySelect
      value={ticket.priority}
      onChange={(priority) => act.edit(ticket.id, { priority })}
      label={t('priority-of', 'Priority of {{name}}', { name: ticket.name })}
      variant="flush"
      quiet
    />
  );
};

export const AssigneeCell = ({ ticket, act }: { ticket: Ticket; act: TicketRowActions }) => {
  const { t } = useTranslation('frontline');

  return (
    <MemberCell
      scope={`frontline-ticket.${ticket.id}.assignee`}
      value={ticket.assigneeId}
      onValueChange={(assigneeId) => act.edit(ticket.id, { assigneeId })}
      noneLabel={t('no-assignee', 'No assignee')}
      // A row without one stays blank, as the old list's did; the cell still opens the picker.
      placeholder=""
      aria-label={
        ticket.assigneeId
          ? undefined
          : t('assignee-of', 'Assignee of {{name}}', { name: ticket.name })
      }
    />
  );
};

/** Archive or unarchive, and delete for its channel's admins. */
export const useTicketActions = (ticket: Ticket, act: TicketRowActions): RowAction[] => {
  const { t } = useTranslation('frontline');
  const archived = ticket.state === 'archived';

  return [
    {
      value: 'archive',
      icon: archived ? <IconRestore /> : <IconArchive />,
      label: archived ? t('unarchive', 'Unarchive') : t('archive', 'Archive'),
      onSelect: () => act.edit(ticket.id, { state: archived ? 'active' : 'archived' }),
    },
    ...(ticket.canManage
      ? [
          {
            value: 'delete',
            icon: <IconTrash />,
            label: t('delete', 'Delete'),
            onSelect: () => void act.deleteTickets([ticket.id]),
          },
        ]
      : []),
  ];
};

/** The ticket's actions behind a "more" button, on a list row or a board card. */
export const TicketMenu = ({ ticket, act }: { ticket: Ticket; act: TicketRowActions }) => {
  const { t } = useTranslation('frontline');

  return (
    <ActionsMenu
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('ticket-actions', 'Actions for {{name}}', { name: ticket.name })}
        >
          <IconDots />
        </Button>
      }
      actions={useTicketActions(ticket, act)}
    />
  );
};
