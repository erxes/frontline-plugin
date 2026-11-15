import { memberQueries } from '@erxes/core-contract/client';
import type { InferClientInputs } from '@orpc/client';
import type { Client } from '@frontline/api';
import {
  IconAlertSquareRounded,
  IconArchive,
  IconArrowBarToRight,
  IconProgressCheck,
  IconRestore,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Button, SelectMember } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '../orpc.ts';
import { PRIORITIES, usePipelines, usePriorityName, useStatuses } from '../pipelines/queries.ts';
import { ActionsMenu, DeleteButton, SelectionBar } from '../shared/Records.tsx';
import { useCanDelete, useDeleteTickets } from './useTicketDeletes.ts';
import { type Ticket, useTicketChange } from './useTickets.ts';

type BulkChange = Omit<InferClientInputs<Client>['tickets']['bulkUpdate'], 'ids'>;

/** The one value every ticket shares, or '' when they differ. */
const sharedOf = (tickets: Ticket[], key: 'channelId' | 'pipelineId') => {
  const values = new Set(tickets.map((ticket) => ticket[key]));

  return values.size === 1 ? (tickets[0]?.[key] ?? '') : '';
};

/** A bar button that opens a list of `options`; picking one makes `onPick`'s change. */
const ChangeMenu = ({
  icon,
  label,
  options,
  onPick,
}: {
  icon: ReactNode;
  label: string;
  options: { value: string; label: string; change: BulkChange }[];
  onPick: (change: BulkChange) => void;
}) => (
  <ActionsMenu
    trigger={
      <Button variant="secondary">
        {icon}
        {label}
      </Button>
    }
    actions={options.map((option) => ({
      value: option.value,
      icon: null,
      label: option.label,
      onSelect: () => onPick(option.change),
    }))}
  />
);

/**
 * What the bar changes on the selected tickets. A status needs them in one
 * pipeline, and another pipeline comes from their shared channel.
 */
const Actions = ({
  tickets,
  onChange,
}: {
  tickets: Ticket[];
  onChange: (change: BulkChange) => void;
}) => {
  const { t } = useTranslation('frontline');
  const nameOf = usePriorityName();
  const pipelineId = sharedOf(tickets, 'pipelineId');
  const statuses = useStatuses(pipelineId).data ?? [];

  const others = usePipelines(sharedOf(tickets, 'channelId')).pipelines.filter(
    (pipeline) => pipeline.id !== pipelineId,
  );

  const archived = tickets.every((ticket) => ticket.state === 'archived');

  return (
    <>
      <SelectMember.Field
        value={null}
        onValueChange={(assigneeId) => onChange({ assigneeId })}
        members={memberQueries}
        noneLabel={t('no-assignee', 'No assignee')}
        placeholder={t('assign-to', 'Assign to')}
        aria-label={t('assign-to', 'Assign to')}
      />
      <ChangeMenu
        icon={<IconAlertSquareRounded />}
        label={t('priority', 'Priority')}
        options={PRIORITIES.map((priority) => ({
          value: String(priority),
          label: nameOf(priority),
          change: { priority },
        }))}
        onPick={onChange}
      />
      {pipelineId && (
        <ChangeMenu
          icon={<IconProgressCheck />}
          label={t('status', 'Status')}
          options={statuses.map((status) => ({
            value: status.id,
            label: status.name,
            change: { statusId: status.id },
          }))}
          onPick={onChange}
        />
      )}
      {others.length > 0 && (
        <ChangeMenu
          icon={<IconArrowBarToRight />}
          label={t('move-to-pipeline', 'Move to pipeline')}
          options={others.map((pipeline) => ({
            value: pipeline.id,
            label: pipeline.name,
            change: { pipelineId: pipeline.id },
          }))}
          onPick={onChange}
        />
      )}
      <Button
        variant="secondary"
        onClick={() => onChange({ state: archived ? 'active' : 'archived' })}
      >
        {archived ? <IconRestore /> : <IconArchive />}
        {archived ? t('unarchive', 'Unarchive') : t('archive', 'Archive')}
      </Button>
    </>
  );
};

/** Assigns, prioritises, moves, archives or deletes the selected tickets, each in one request. */
export const TicketsCommandBar = ({ tickets }: { tickets: Ticket[] }) => {
  const bulk = useMutation(orpc.tickets.bulkUpdate.mutationOptions(useTicketChange()));
  const canDelete = useCanDelete();
  const { deleteTickets, isPending } = useDeleteTickets();

  return (
    <SelectionBar>
      {(ids, clear) => {
        const selected = tickets.filter((ticket) => ids.includes(ticket.id));

        return (
          <>
            <Actions
              tickets={selected}
              onChange={(change) => bulk.mutate({ ids, ...change }, { onSuccess: clear })}
            />
            {selected.every(canDelete) && (
              <DeleteButton
                disabled={isPending || bulk.isPending}
                onClick={() => void deleteTickets(ids, clear)}
              />
            )}
          </>
        );
      }}
    </SelectionBar>
  );
};
