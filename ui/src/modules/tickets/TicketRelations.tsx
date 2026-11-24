import { IconPlus, IconTicket } from '@tabler/icons-react';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { Button, Empty, Spinner, type TRecordContacts, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { TICKET_TYPE } from '~/plugin.ts';
import { ticketOptions, useChoices } from './queries.ts';

/**
 * A ticket's customer and company, as core's relation tabs take them (`contacts` in config),
 * from the ticket its panel reads.
 */
export const ticketContacts = async (queryClient: QueryClient, id: string) => {
  const ticket = await queryClient.query(ticketOptions(id));

  return {
    customerIds: ticket.customerId ? [ticket.customerId] : [],
    companyIds: ticket.companyId ? [ticket.companyId] : [],
  };
};

/** The ticket's pipeline, which says what its field groups apply to (`properties` in config). */
export const ticketAppliesTo = async (queryClient: QueryClient, id: string) => ({
  pipeline: [(await queryClient.query(ticketOptions(id))).pipelineId],
});

/** The pipelines a ticket field group can be limited to, as core's Properties settings list them. */
export const pipelineLimits = async () =>
  (await orpc.pipelines.choices.call()).pipelines.map(({ id, name }) => ({
    value: id,
    label: name,
  }));

const anyOf = (path: string, ids: string[]) =>
  ids.length > 0 ? [{ path, op: 'in' as const, value: ids }] : [];

/** The member's tickets about these customers or companies, active and archived, newest first. */
const useContactTickets = ({ customerIds, companyIds }: TRecordContacts) => {
  const filter = {
    match: 'all',
    rules: [
      { path: 'subject.state', op: 'in', value: ['active', 'archived'] },
      {
        match: 'any',
        rules: [
          ...anyOf('subject.customerId', customerIds),
          ...anyOf('subject.companyId', companyIds),
        ],
      },
    ],
  };

  return useQuery({
    ...orpc.tickets.list.queryOptions({
      input: { filter: JSON.stringify(filter), sort: 'createdAt', limit: 50 },
    }),
    enabled: customerIds.length + companyIds.length > 0,
  });
};

/** Opens a new ticket in core's side panel, for the record's first customer. */
const CreateTicket = ({ customerIds }: TRecordContacts) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => openNew(TICKET_TYPE, { customerId: customerIds[0] ?? '' })}
    >
      <IconPlus />
      {t('create-ticket', 'Create ticket')}
    </Button>
  );
};

/**
 * The Tickets tab on a customer's, company's or ecommerce order's panel: the member's tickets
 * about its customers and companies, and a button that starts one for its customer. One opens on
 * top in core's side panel.
 */
export const TicketRelations = (contacts: TRecordContacts) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();
  const statusName = new Map(useChoices().statuses.map((status) => [status.id, status.name]));
  const tickets = useContactTickets(contacts);

  if (tickets.isLoading) return <Spinner area="lg" />;

  if (tickets.error)
    return <p className="m-3 text-xs text-destructive-text">{tickets.error.message}</p>;

  const rows = tickets.data?.tickets ?? [];

  if (rows.length === 0) {
    return (
      <Empty variant="outline" className="m-3">
        <Empty.Header>
          <Empty.Media>
            <IconTicket />
          </Empty.Media>
          <Empty.Title>{t('no-tickets-yet', 'No tickets yet')}</Empty.Title>
        </Empty.Header>
        <Empty.Content>
          <CreateTicket {...contacts} />
        </Empty.Content>
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-1 p-2">
      <li className="flex justify-end">
        <CreateTicket {...contacts} />
      </li>
      {rows.map((ticket) => (
        <li key={ticket.id}>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            onClick={() => open({ contentType: TICKET_TYPE, contentId: ticket.id })}
          >
            <span className="text-xs text-muted-foreground">{ticket.number}</span>
            <span className="min-w-0 flex-1 truncate">{ticket.name}</span>
            <span className="text-xs text-muted-foreground">{statusName.get(ticket.statusId)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};
