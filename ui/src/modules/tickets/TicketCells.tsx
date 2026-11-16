import { memberQueries } from '@erxes/core-contract/client';
import { IconArchive, IconDots, IconRestore, IconTrash } from '@tabler/icons-react';
import { Button, Select, SelectMember, useOpenRecord } from 'erxes-ui';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { PRIORITIES, usePriorityNames } from '@/pipelines/queries.ts';
import { StageIcon } from '@/pipelines/StatusRow.tsx';
import { TICKET_TYPE } from '~/plugin.ts';
import { ActionsMenu, type RowAction } from '~/shared/Records.tsx';
import { type Ticket, useChoices, useDeleteTickets, useEditTicket } from './queries.ts';

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

/** The five priorities, critical to none. */
export const PrioritySelect = ({
  value,
  onChange,
  label,
  variant,
}: {
  value: number;
  onChange: (priority: number) => void;
  label: string;
  variant?: Variant;
}) => {
  const names = usePriorityNames();

  return (
    <Select
      value={String(value)}
      onValueChange={(next) =>
        onChange(PRIORITIES.find((priority) => String(priority) === next) ?? 0)
      }
    >
      <Select.Trigger variant={variant} aria-label={label}>
        <Select.Value>{names[value]}</Select.Value>
      </Select.Trigger>
      <Select.Content>
        {PRIORITIES.map((priority) => (
          <Select.Item key={priority} value={String(priority)}>
            {names[priority]}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};

/** The ticket's status; picking another moves it. */
export const StatusCell = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditTicket(ticket.id);

  return (
    <StatusSelect
      pipelineId={ticket.pipelineId}
      value={ticket.statusId}
      onChange={(statusId) => edit({ statusId })}
      label={t('status-of', 'Status of {{name}}', { name: ticket.name })}
      variant="flush"
      disabled={!ticket.canMove}
    />
  );
};

export const PriorityCell = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditTicket(ticket.id);

  return (
    <PrioritySelect
      value={ticket.priority}
      onChange={(priority) => edit({ priority })}
      label={t('priority-of', 'Priority of {{name}}', { name: ticket.name })}
      variant="flush"
    />
  );
};

export const AssigneeCell = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditTicket(ticket.id);

  return (
    <SelectMember.InlineCell
      scope={`frontline-ticket.${ticket.id}.assignee`}
      value={ticket.assigneeId}
      onValueChange={(assigneeId) => edit({ assigneeId })}
      members={memberQueries}
      noneLabel={t('no-assignee', 'No assignee')}
      placeholder={t('assignee', 'Assignee')}
      aria-label={
        ticket.assigneeId
          ? undefined
          : t('assignee-of', 'Assignee of {{name}}', { name: ticket.name })
      }
    />
  );
};

/** Archive or unarchive, and delete for its channel's admins; `onDeleted` runs after. */
export const useTicketActions = (ticket: Ticket, onDeleted?: () => void): RowAction[] => {
  const { t } = useTranslation('frontline');
  const edit = useEditTicket(ticket.id);
  const { deleteTickets } = useDeleteTickets();
  const archived = ticket.state === 'archived';

  return [
    {
      value: 'archive',
      icon: archived ? <IconRestore /> : <IconArchive />,
      label: archived ? t('unarchive', 'Unarchive') : t('archive', 'Archive'),
      onSelect: () => edit({ state: archived ? 'active' : 'archived' }),
    },
    ...(ticket.canManage
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

/** The ticket's actions behind a "more" button, on a list row or a board card. */
export const TicketMenu = ({ ticket }: { ticket: Ticket }) => {
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
      actions={useTicketActions(ticket)}
    />
  );
};
