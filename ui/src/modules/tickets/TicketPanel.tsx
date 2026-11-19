import {
  IconAlertSquareRounded,
  IconCalendarCheck,
  IconCalendarClock,
  IconCalendarPlus,
  IconCalendarUp,
  IconCircles,
  IconForms,
  IconGitBranch,
  IconHash,
  IconLetterCase,
  IconMessage,
  IconProgressCheck,
  IconUserCircle,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  PanelField,
  PanelSection,
  Skeleton,
  Spinner,
  TextField,
  type TRecordSlotProps,
  useFormat,
  useOpenRecord,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useChannel } from '@/channels/useChannels.ts';
import { orpc } from '~/orpc.ts';
import { conversationPath, FORM_SUBMISSION_TYPE } from '~/plugin.ts';
import { PrioritySelect, StatusSelect, TicketMenu } from './TicketCells.tsx';
import { TicketContent, TicketPlan, TicketSla } from './TicketFields.tsx';
import { TicketContacts, TicketLabels, TicketPeople } from './TicketLinks.tsx';
import {
  type Ticket,
  useChoices,
  useEditTicket,
  useTicket,
  useTicketRowActions,
} from './queries.ts';
import { InfoRow } from '~/shared/Panel.tsx';
import { MemberChip } from '~/shared/Person.tsx';

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

/** The header's menu, a row's (`useTicketActions`). */
export const TicketActions = ({ contentId }: TRecordSlotProps) => {
  const { data } = useTicket(contentId);
  const act = useTicketRowActions();

  return data ? <TicketMenu ticket={data} act={act} /> : null;
};

/**
 * Where the ticket is filed, the inbox conversation it was made from, who made it when, and when
 * its status last moved and it was resolved, read only, at the foot of the tab.
 */
const TicketRecord = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const channel = useChannel(ticket.channelId);
  const pipeline = useChoices().pipelines.find((row) => row.id === ticket.pipelineId);

  return (
    <PanelSection title={t('record', 'Record')}>
      <InfoRow icon={IconCircles} label={t('channel', 'Channel')}>
        {channel.data?.name}
      </InfoRow>
      <InfoRow icon={IconGitBranch} label={t('pipeline', 'Pipeline')}>
        {pipeline?.name}
      </InfoRow>
      {ticket.conversationId && (
        <InfoRow icon={IconMessage} label={t('conversation', 'Conversation')}>
          <Link to={conversationPath(ticket.conversationId)} className="truncate hover:underline">
            {t('open-in-inbox', 'Open in the inbox')}
          </Link>
        </InfoRow>
      )}
      <InfoRow icon={IconUserCircle} label={t('created-by', 'Created by')}>
        <MemberChip id={ticket.createdBy} />
      </InfoRow>
      <InfoRow icon={IconCalendarPlus} label={t('created-at', 'Created at')}>
        {format.dateTime(ticket.createdAt)}
      </InfoRow>
      <InfoRow icon={IconCalendarUp} label={t('updated-at', 'Updated at')}>
        {format.dateTime(ticket.updatedAt)}
      </InfoRow>
      <InfoRow icon={IconCalendarClock} label={t('status-changed-at', 'Status changed')}>
        {format.dateTime(ticket.statusChangedAt)}
      </InfoRow>
      {ticket.resolvedAt && (
        <InfoRow icon={IconCalendarCheck} label={t('resolved-at', 'Resolved at')}>
          {format.dateTime(ticket.resolvedAt)}
        </InfoRow>
      )}
    </PanelSection>
  );
};

/** The ticket's own fields, edited in place by its channel's members. */
const TicketFields = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
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
      {ticket.number && (
        <InfoRow icon={IconHash} label={t('number', 'Number')}>
          {ticket.number}
        </InfoRow>
      )}
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
    </PanelSection>
  );
};

/**
 * The answers customers sent about the ticket through a form link, newest first, each opening its
 * submission on top of the ticket; nothing when there are none.
 */
const TicketResponses = ({ ticketId }: { ticketId: string }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const { open } = useOpenRecord();

  const { data: responses = [] } = useQuery(
    orpc.tickets.responses.queryOptions({ input: { id: ticketId } }),
  );

  if (responses.length === 0) return null;

  return (
    <PanelSection title={t('ticket-form-responses', 'Responses')}>
      {responses.map((response) => (
        <button
          key={response.id}
          type="button"
          className="flex h-8 w-full items-center justify-between gap-2 rounded px-2 text-xs hover:bg-accent"
          onClick={() => open({ contentType: FORM_SUBMISSION_TYPE, contentId: response.id })}
        >
          <span className="flex min-w-0 items-center gap-2">
            <IconForms className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{response.formName}</span>
          </span>
          <span className="shrink-0 text-muted-foreground">
            {format.dateTime(response.createdAt)}
          </span>
        </button>
      ))}
    </PanelSection>
  );
};

/**
 * The Detail tab: the ticket's fields, people, contacts, labels and properties, its plan, its SLA,
 * its description and files, each saved as it changes, the answers sent about it, then where it's
 * filed. Core's Activity tab beside it shows what changed (`activity` in config).
 */
export const TicketDetail = ({ contentId }: TRecordSlotProps) => (
  <WithTicket id={contentId}>
    {(ticket) => (
      <>
        <TicketFields ticket={ticket} />
        <TicketPeople ticket={ticket} />
        <TicketContacts ticket={ticket} />
        <TicketLabels ticket={ticket} />
        <TicketPlan ticket={ticket} />
        <TicketSla ticket={ticket} />
        <TicketContent ticket={ticket} />
        <TicketResponses ticketId={ticket.id} />
        <TicketRecord ticket={ticket} />
      </>
    )}
  </WithTicket>
);
