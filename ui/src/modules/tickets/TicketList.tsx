import { IconPlus } from '@tabler/icons-react';
import {
  Button,
  RecordList,
  type RecordListGroup,
  RelativeDateDisplay,
  useOpenRecord,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { StageIcon } from '@/pipelines/StageIcon.tsx';
import { TICKET_TYPE } from '~/plugin.ts';
import { AssigneeCell, PriorityCell, TicketMenu, TicketName } from './TicketCells.tsx';
import { SlaBadge } from './SlaBadge.tsx';
import { TicketTags } from './TicketLinks.tsx';
import {
  type Ticket,
  type TicketRowActions,
  useChoices,
  useTicketPipeline,
  useTicketRowActions,
} from './queries.ts';

/** One ticket: its number and name, tags, SLA, priority, assignee, last change, and its menu. */
const TicketRow = ({ ticket, act }: { ticket: Ticket; act: TicketRowActions }) => (
  <div className="flex min-w-0 flex-1 items-center gap-3 text-xs">
    <span className="flex min-w-0 flex-1">
      <TicketName ticket={ticket} />
    </span>
    <span className="hidden max-w-48 lg:flex">
      <TicketTags tagIds={ticket.tagIds} />
    </span>
    <SlaBadge ticket={ticket} />
    <span className="w-32 shrink-0">
      <PriorityCell ticket={ticket} act={act} />
    </span>
    <span className="hidden w-44 shrink-0 md:block">
      <AssigneeCell ticket={ticket} act={act} />
    </span>
    <span className="w-24 shrink-0 text-muted-foreground">
      <RelativeDateDisplay value={ticket.updatedAt.toISOString()}>
        <RelativeDateDisplay.Value value={ticket.updatedAt.toISOString()} />
      </RelativeDateDisplay>
    </span>
    <TicketMenu ticket={ticket} act={act} />
  </div>
);

/** The shown pipeline's statuses by stage and order, each with its tickets. */
export const useStatusGroups = (tickets: Ticket[]) => {
  const { statuses } = useChoices();
  const pipelineId = useTicketPipeline()?.id;
  const byStatus = Map.groupBy(tickets, (ticket) => ticket.statusId);

  return statuses
    .filter((status) => status.pipelineId === pipelineId)
    .map((status) => ({ status, label: status.name, rows: byStatus.get(status.id) ?? [] }));
};

/**
 * The tickets grouped by status, each group under a header that folds it away and adds a ticket
 * in that status. Inside `RecordList.Provider`, whose selection the bulk bar reads.
 */
export const TicketList = ({ tickets }: { tickets: Ticket[] }) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const act = useTicketRowActions();

  const groups: RecordListGroup<Ticket>[] = useStatusGroups(tickets)
    .filter((group) => group.rows.length > 0)
    .map(({ status, label, rows }) => ({
      id: status.id,
      label,
      icon: <StageIcon type={status.type} color={status.color} />,
      rows,
      action: (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('add-ticket-to', 'Add a ticket to {{status}}', { status: label })}
          onClick={() =>
            openNew(TICKET_TYPE, { pipelineId: status.pipelineId, statusId: status.id })
          }
        >
          <IconPlus />
        </Button>
      ),
    }));

  return (
    <RecordList
      groups={groups}
      rowId={(ticket) => ticket.id}
      rowLabel={(ticket) => ticket.name}
      renderRow={(ticket) => <TicketRow ticket={ticket} act={act} />}
    />
  );
};
