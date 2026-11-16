import { memberQueries } from '@erxes/core-contract/client';
import {
  IconAlertSquareRounded,
  IconCalendarPlus,
  IconCalendarUp,
  IconCircles,
  IconDots,
  IconGitBranch,
  IconHash,
  IconLetterCase,
  IconProgressCheck,
  IconUser,
  IconUserCircle,
} from '@tabler/icons-react';
import {
  Button,
  PanelField,
  PanelSection,
  SelectMember,
  Skeleton,
  Spinner,
  TextField,
  type TRecordSlotProps,
  useFormat,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useChannel } from '@/channels/useChannels.ts';
import { ActionsMenu } from '~/shared/Records.tsx';
import { PrioritySelect, StatusSelect, useTicketActions } from './TicketCells.tsx';
import { TicketContent, TicketPlan, TicketSla } from './TicketFields.tsx';
import { TicketContacts, TicketLabels, TicketPeople } from './TicketLinks.tsx';
import { TicketPropertiesSection } from './TicketProperties.tsx';
import { type Ticket, useChoices, useEditTicket, useTicket } from './queries.ts';
import { InfoRow } from '~/shared/Panel.tsx';
import { MemberChip } from '~/shared/MemberLine.tsx';

/** A slot's ticket: a spinner while it loads, the refusal when the API gives one. */
const WithTicket = ({ id, children }: { id: string; children: (ticket: Ticket) => ReactNode }) => {
  const ticket = useTicket(id);

  if (ticket.isPending) return <Spinner area="lg" />;

  if (ticket.isError) {
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {ticket.error.message}
      </p>
    );
  }

  return children(ticket.data);
};

/** The panel header's title: the ticket's number and name. */
export const TicketTitle = ({ contentId }: TRecordSlotProps) => {
  const ticket = useTicket(contentId);

  if (ticket.isPending) return <Skeleton className="h-4 w-32" />;

  return (
    <span className="truncate">
      {ticket.data
        ? [ticket.data.number, ticket.data.name].filter(Boolean).join(' ')
        : ticket.error?.message}
    </span>
  );
};

/** The header's menu: archive or unarchive, and delete for its channel's admins. */
export const TicketActions = ({ contentId }: TRecordSlotProps) => {
  const { data } = useTicket(contentId);

  return data ? <TicketMenu ticket={data} /> : null;
};

const TicketMenu = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('ticket-menu', 'Ticket actions')}>
          <IconDots />
        </Button>
      }
      actions={useTicketActions(ticket)}
    />
  );
};

/** Where the ticket is filed: its channel and pipeline, read only. */
const Filing = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const channel = useChannel(ticket.channelId);
  const pipeline = useChoices().pipelines.find((row) => row.id === ticket.pipelineId);

  return (
    <>
      <PanelField icon={IconCircles} label={t('channel', 'Channel')} cell={false}>
        <span className="truncate px-2 text-xs">{channel.data?.name}</span>
      </PanelField>
      <PanelField icon={IconGitBranch} label={t('pipeline', 'Pipeline')} cell={false}>
        <span className="truncate px-2 text-xs">{pipeline?.name}</span>
      </PanelField>
    </>
  );
};

/** The ticket's own fields, edited in place by its channel's members. */
const TicketFields = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const edit = useEditTicket(ticket.id);
  const scope = `frontline-ticket.${ticket.id}`;

  return (
    <PanelSection title={t('ticket', 'Ticket')}>
      <PanelField icon={IconLetterCase} label={t('name', 'Name')}>
        <TextField
          scope={`${scope}.name`}
          value={ticket.name}
          placeholder={t('name', 'Name')}
          onSave={(name) => {
            const next = name.trim();

            if (next && next !== ticket.name) edit({ name: next });
          }}
        />
      </PanelField>
      <InfoRow icon={IconHash} label={t('number', 'Number')}>
        {ticket.number}
      </InfoRow>
      <PanelField icon={IconProgressCheck} label={t('status', 'Status')} cell={false}>
        <StatusSelect
          pipelineId={ticket.pipelineId}
          value={ticket.statusId}
          onChange={(statusId) => edit({ statusId })}
          label={t('status', 'Status')}
          variant="flush"
          disabled={!ticket.canMove}
        />
      </PanelField>
      <PanelField icon={IconAlertSquareRounded} label={t('priority', 'Priority')} cell={false}>
        <PrioritySelect
          value={ticket.priority}
          onChange={(priority) => edit({ priority })}
          label={t('priority', 'Priority')}
          variant="flush"
        />
      </PanelField>
      <PanelField icon={IconUser} label={t('assignee', 'Assignee')} cell={false}>
        <SelectMember.Linked
          scope={`${scope}.assignee`}
          value={ticket.assigneeId}
          onValueChange={(assigneeId) => edit({ assigneeId })}
          members={memberQueries}
          noneLabel={t('no-assignee', 'No assignee')}
          addLabel={t('add-assignee', 'Add assignee')}
          changeLabel={t('change-assignee', 'Change assignee')}
        />
      </PanelField>
      <Filing ticket={ticket} />
      <InfoRow icon={IconUserCircle} label={t('created-by', 'Created by')}>
        <MemberChip id={ticket.createdBy} />
      </InfoRow>
      <InfoRow icon={IconCalendarPlus} label={t('created-at', 'Created at')}>
        {format.dateTime(ticket.createdAt)}
      </InfoRow>
      <InfoRow icon={IconCalendarUp} label={t('updated-at', 'Updated at')}>
        {format.dateTime(ticket.updatedAt)}
      </InfoRow>
    </PanelSection>
  );
};

/**
 * The Detail tab: the ticket's fields, people, contacts, labels and properties, its plan, its SLA
 * and its description and files, each
 * saved as it changes. Core's Activity tab beside it shows what changed (`activity` in config).
 */
export const TicketDetail = ({ contentId }: TRecordSlotProps) => (
  <WithTicket id={contentId}>
    {(ticket) => (
      <>
        <TicketFields ticket={ticket} />
        <TicketPeople ticket={ticket} />
        <TicketContacts ticket={ticket} />
        <TicketLabels ticket={ticket} />
        <TicketPropertiesSection ticket={ticket} />
        <TicketPlan ticket={ticket} />
        <TicketSla ticket={ticket} />
        <TicketContent ticket={ticket} />
      </>
    )}
  </WithTicket>
);
