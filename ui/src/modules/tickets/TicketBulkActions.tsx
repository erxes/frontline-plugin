import {
  IconAlertSquareRounded,
  IconArchive,
  IconArrowBarToRight,
  IconProgressCheck,
  IconRestore,
} from '@tabler/icons-react';
import { Button } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { PRIORITIES, usePriorityNames } from '@/pipelines/queries.ts';
import { MemberSelect } from '~/shared/MemberPicker.tsx';
import { ActionsMenu, DeleteButton } from '~/shared/Records.tsx';
import {
  type BulkChange,
  type TicketRow,
  useBulkChange,
  useChoices,
  useDeleteTickets,
} from './queries.ts';

/** The one value every ticket shares, or '' when they differ. */
const sharedOf = (tickets: TicketRow[], key: 'channelId' | 'pipelineId') => {
  const values = new Set(tickets.map((ticket) => ticket[key]));

  return values.size === 1 ? (tickets[0]?.[key] ?? '') : '';
};

/** A bar button that opens a list of `options`; picking one makes its change. */
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

/** Moves to a status when the tickets share a pipeline, or to another pipeline of their shared channel. */
const MoveMenus = ({
  tickets,
  onPick,
}: {
  tickets: TicketRow[];
  onPick: (change: BulkChange) => void;
}) => {
  const { t } = useTranslation('frontline');
  const choices = useChoices();
  const pipelineId = sharedOf(tickets, 'pipelineId');
  const channelId = sharedOf(tickets, 'channelId');
  const statuses = choices.statuses.filter((status) => status.pipelineId === pipelineId);

  const others = choices.pipelines.filter(
    (pipeline) => pipeline.channelId === channelId && pipeline.id !== pipelineId,
  );

  return (
    <>
      {statuses.length > 0 && (
        <ChangeMenu
          icon={<IconProgressCheck />}
          label={t('status', 'Status')}
          options={statuses.map((status) => ({
            value: status.id,
            label: status.name,
            change: { statusId: status.id },
          }))}
          onPick={onPick}
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
          onPick={onPick}
        />
      )}
    </>
  );
};

/**
 * What the bar does to the selected tickets, each in one request: assign, set a priority, move
 * them (`MoveMenus`), archive or unarchive, and delete when the member is an admin of all their
 * channels.
 */
export const TicketBulkActions = ({
  tickets,
  clear,
}: {
  tickets: TicketRow[];
  clear: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const priorities = usePriorityNames();
  const bulk = useBulkChange();
  const { deleteTickets, isPending } = useDeleteTickets();
  const ids = tickets.map((ticket) => ticket.id);
  const archived = tickets.length > 0 && tickets.every((ticket) => ticket.state === 'archived');
  const change = (picked: BulkChange) => bulk.change(ids, picked, clear);

  return (
    <>
      <MemberSelect
        value={null}
        onValueChange={(assigneeId) => change({ assigneeId })}
        noneLabel={t('no-assignee', 'No assignee')}
        placeholder={t('assign-to', 'Assign to')}
        aria-label={t('assign-to', 'Assign to')}
      />
      <ChangeMenu
        icon={<IconAlertSquareRounded />}
        label={t('priority', 'Priority')}
        options={PRIORITIES.map((priority) => ({
          value: String(priority),
          label: priorities[priority] ?? '',
          change: { priority },
        }))}
        onPick={change}
      />
      <MoveMenus tickets={tickets} onPick={change} />
      <Button
        variant="secondary"
        disabled={bulk.isPending}
        onClick={() => change({ state: archived ? 'active' : 'archived' })}
      >
        {archived ? <IconRestore /> : <IconArchive />}
        {archived ? t('unarchive', 'Unarchive') : t('archive', 'Archive')}
      </Button>
      {tickets.every((ticket) => ticket.canManage) && (
        <DeleteButton
          disabled={isPending || bulk.isPending}
          onClick={() => void deleteTickets(ids, clear)}
        />
      )}
    </>
  );
};
