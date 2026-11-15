import { memberQueries } from '@erxes/core-contract/client';
import { IconDots, IconTicket } from '@tabler/icons-react';
import {
  Button,
  buttonVariants,
  PageContainer,
  PageHeader,
  SelectMember,
  Separator,
  Skeleton,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { usePipeline } from '../pipelines/queries.ts';
import { ActionsMenu } from '../shared/Records.tsx';
import { Field } from '../shared/SidePanel.tsx';
import { PriorityCell, StatusCell, useTicketActions, useUpdateTicket } from './TicketsTable.tsx';
import { TICKETS_PATH } from '../paths.ts';
import { type Ticket, useTicket } from './useTickets.ts';

const crumb = buttonVariants({ variant: 'ghost' });

/** Where the ticket stands and who has it, each changed in place. */
const TicketFields = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const pipeline = usePipeline(ticket.pipelineId).data;
  const update = useUpdateTicket();

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-4">
      <Field label={t('pipeline', 'Pipeline')}>
        <span className="text-sm">{pipeline?.name ?? '…'}</span>
      </Field>
      <Field label={t('status', 'Status')}>
        <StatusCell ticket={ticket} />
      </Field>
      <Field label={t('priority', 'Priority')}>
        <PriorityCell ticket={ticket} />
      </Field>
      <Field id="ticket-assignee" label={t('assignee', 'Assignee')}>
        <SelectMember.Field
          id="ticket-assignee"
          value={ticket.assigneeId}
          onValueChange={(assigneeId) => update.mutate({ id: ticket.id, assigneeId })}
          members={memberQueries}
          noneLabel={t('no-assignee', 'No assignee')}
          placeholder={t('no-assignee', 'No assignee')}
        />
      </Field>
    </aside>
  );
};

/** The ticket's actions behind a "more" button; a delete returns to the list. */
const TicketMenu = ({ ticket }: { ticket: Ticket }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const actions = useTicketActions(ticket, () => void navigate(TICKETS_PATH));

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('ticket-actions-menu', 'Ticket actions')}>
          <IconDots />
        </Button>
      }
      actions={actions}
    />
  );
};

/** One ticket's own page, where a link from the list or the board leads. */
export const TicketPage = () => {
  const { t } = useTranslation('frontline');
  const { ticketId = '' } = useParams();
  const { data: ticket, error } = useTicket(ticketId);

  return (
    <PageContainer>
      <PageHeader>
        <PageHeader.Start>
          <Link to={TICKETS_PATH} className={crumb}>
            <IconTicket />
            {t('tickets', 'Tickets')}
          </Link>
          <Separator.Inline />
          <Link to={`${TICKETS_PATH}/${ticketId}`} className={crumb}>
            {ticket?.number ?? ticket?.name ?? '…'}
          </Link>
        </PageHeader.Start>
        <PageHeader.End>{ticket && <TicketMenu ticket={ticket} />}</PageHeader.End>
      </PageHeader>
      {error ? (
        <p className="m-3 text-sm text-destructive-text">{error.message}</p>
      ) : ticket ? (
        <div className="flex min-h-0 flex-1 gap-6 overflow-auto p-6">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <h1 className="text-xl font-semibold">{ticket.name}</h1>
          </div>
          <TicketFields ticket={ticket} />
        </div>
      ) : (
        <Skeleton className="m-6 h-60" />
      )}
    </PageContainer>
  );
};
