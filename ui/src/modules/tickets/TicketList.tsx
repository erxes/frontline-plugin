import { IconChevronDown, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { Button, Checkbox, cn, RecordList, Skeleton, stored, useOpenRecord } from 'erxes-ui';
import { useAtom } from 'jotai';
import { memo, type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { StageIcon } from '@/pipelines/StageIcon.tsx';
import { PLUGIN, TICKET_TYPE } from '~/plugin.ts';
import { LoadPage, RowDate } from '~/shared/List.tsx';
import { type Paging, useLoadMore } from '~/shared/paging.ts';
import { ListSelectionBar } from '~/shared/Records.tsx';
import { AssigneeCell, PriorityCell, TicketMenu, TicketName } from './TicketCells.tsx';
import { SlaBadge } from './SlaBadge.tsx';
import { TicketBulkActions } from './TicketBulkActions.tsx';
import { TicketTags } from './TicketLinks.tsx';
import {
  type TicketRow,
  type TicketRowActions,
  useChoices,
  useColumnTickets,
  useShownPipelineId,
  useShownTickets,
  useTicketRowActions,
} from './queries.ts';

/**
 * One ticket: its number and name, tags, SLA, priority, assignee, last change, and its menu. The
 * tags show only on a row wide enough to keep the name readable beside them.
 */
const TicketLine = ({ ticket, act }: { ticket: TicketRow; act: TicketRowActions }) => (
  <div className="@container flex min-w-0 flex-1 items-center gap-3 text-xs">
    <span className="flex min-w-0 flex-1">
      <TicketName ticket={ticket} />
    </span>
    <span className="hidden max-w-48 @3xl:flex">
      <TicketTags tagIds={ticket.tagIds} />
    </span>
    <SlaBadge ticket={ticket} />
    <span className="w-32 shrink-0">
      <PriorityCell ticket={ticket} act={act} />
    </span>
    <span className="hidden w-44 shrink-0 md:block">
      <AssigneeCell ticket={ticket} act={act} />
    </span>
    <RowDate date={ticket.updatedAt} />
    <TicketMenu ticket={ticket} act={act} />
  </div>
);

/** The shown pipeline's statuses by stage and order. */
export const usePipelineStatuses = () => {
  const { statuses } = useChoices();
  const pipelineId = useShownPipelineId();

  return statuses.filter((status) => status.pipelineId === pipelineId);
};

type Status = ReturnType<typeof usePipelineStatuses>[number];

/** The status groups folded away, kept in this browser; a folded group loads nothing. */
const foldedGroups = stored({
  key: `erxes:${PLUGIN}:folded-ticket-groups`,
  schema: z.array(z.string().max(100)).max(500),
  initial: [],
});

/** Skeleton rows while a page loads, and the point that loads the next as it nears the view. */
const More = ({ paging, root }: { paging: Paging; root: RefObject<HTMLElement | null> }) => {
  const sentinel = useLoadMore(paging, root);

  return (
    <>
      {(paging.isPending || paging.isFetchingNextPage) && (
        <div aria-hidden className="flex flex-col gap-1 p-2">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-9" />
          ))}
        </div>
      )}
      {paging.isFetchNextPageError && <LoadPage paging={paging} />}
      <div ref={sentinel} className="h-px" aria-hidden />
    </>
  );
};

/** Picks or drops every loaded ticket of a group; shows on hover until something is picked. */
const GroupCheckbox = ({ label, ids }: { label: string; ids: string[] }) => {
  const { t } = useTranslation('frontline');
  const selection = RecordList.useSelection();
  const picked = ids.filter(selection.has).length;

  return (
    <span
      className={cn(
        'flex h-9 w-8 shrink-0 items-center justify-center',
        !picked &&
          'opacity-0 group-hover/list-row:opacity-100 group-focus-within/list-row:opacity-100',
      )}
    >
      <Checkbox
        checked={picked > 0 && picked === ids.length}
        indeterminate={picked > 0 && picked < ids.length}
        disabled={ids.length === 0}
        aria-label={t('select-all-in', 'Select all in {{group}}', { group: label })}
        onCheckedChange={() => selection.toggleAll(ids)}
      />
    </span>
  );
};

/**
 * One status's tickets under a sticky header that folds them away, with how many match in all,
 * picks the loaded ones and adds a ticket in the status. They load a page at a time as the list
 * scrolls, as in Linear; a status with none hides once its count is in.
 */
const StatusGroup = memo(function StatusGroup({
  status,
  act,
  root,
}: {
  status: Status;
  act: TicketRowActions;
  root: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const selection = RecordList.useSelection();
  const [folded, setFolded] = useAtom(foldedGroups);
  const open = !folded.includes(status.id);
  const group = useColumnTickets(status.id, open);

  // A ticket moved to another status leaves this group before the lists refetch.
  const tickets = group.rows.filter((ticket) => ticket.statusId === status.id);
  const ids = tickets.map((ticket) => ticket.id);
  const panelId = `frontline-tickets-${status.id}`;

  if (group.totalCount === 0) return null;

  const toggleFold = () => {
    if (!open) {
      setFolded((current) => current.filter((id) => id !== status.id));

      return;
    }

    // Folded rows leave the selection, so the bar acts only on rows in view.
    for (const id of ids.filter(selection.has)) selection.toggle(id);

    setFolded((current) => [...current, status.id]);
  };

  return (
    <section aria-label={status.name}>
      <div className="group/list-row sticky top-0 z-10 flex h-9 items-center gap-1 border-b bg-muted px-2 text-xs font-medium">
        <GroupCheckbox label={status.name} ids={ids} />
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={toggleFold}
        >
          {open ? <IconChevronDown aria-hidden /> : <IconChevronRight aria-hidden />}
          <StageIcon type={status.type} color={status.color} />
          {status.name}
          <span className="text-muted-foreground tabular-nums">{group.totalCount}</span>
        </Button>
        <span className="ml-auto flex items-center">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('add-ticket-to', 'Add a ticket to {{status}}', { status: status.name })}
            onClick={() =>
              openNew(TICKET_TYPE, { pipelineId: status.pipelineId, statusId: status.id })
            }
          >
            <IconPlus />
          </Button>
        </span>
      </div>
      {open && (
        <div id={panelId}>
          <LoadPage paging={group} newer />
          <RecordList
            groups={[{ id: status.id, label: status.name, rows: tickets }]}
            grouped={false}
            rowId={(ticket) => ticket.id}
            rowLabel={(ticket) => ticket.name}
            renderRow={(ticket) => <TicketLine ticket={ticket} act={act} />}
          />
          <More paging={group} root={root} />
        </div>
      )}
    </section>
  );
});

/**
 * The bulk bar for the picked tickets, read from the status groups' lists. It reads them again on
 * each pick: the groups' lists may already be in when they mount, so no request settles to.
 */
const TicketSelection = () => {
  RecordList.useSelection();
  const shown = useShownTickets();

  return (
    <ListSelectionBar shown={[...shown.keys()]}>
      {(selected, clear) => (
        <TicketBulkActions tickets={selected.flatMap((id) => shown.get(id) ?? [])} clear={clear} />
      )}
    </ListSelectionBar>
  );
};

/**
 * The shown pipeline's tickets grouped by status, each group its own paged list under the same
 * filter and sort as the other displays, so every status shows from the start. Inside
 * `RecordList.Provider`, whose selection the bulk bar reads.
 */
export const TicketList = () => {
  const statuses = usePipelineStatuses();
  const act = useTicketRowActions();
  const root = useRef<HTMLDivElement>(null);

  return (
    <>
      <div ref={root} className="min-h-0 flex-1 overflow-y-auto">
        {statuses.map((status) => (
          <StatusGroup key={status.id} status={status} act={act} root={root} />
        ))}
      </div>
      <TicketSelection />
    </>
  );
};
