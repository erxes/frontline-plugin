import { ORPCError } from '@orpc/client';
import { IconTicket } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Empty, Spinner, type TRecordContacts, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { TICKET_TYPE } from '~/plugin.ts';
import { REFERENCE_MS } from '~/shared/reference.ts';
import { useChoices } from './queries.ts';

/** A ticket's customer and company, as core's relation tabs take them (`contacts` in config). */
export const ticketContacts = async (id: string) => {
  const ticket = await orpc.tickets.get.call({ id });

  return {
    customerIds: ticket.customerId ? [ticket.customerId] : [],
    companyIds: ticket.companyId ? [ticket.companyId] : [],
  };
};

const anyOf = (path: string, ids: string[]) =>
  ids.length > 0 ? [{ path, op: 'in' as const, value: ids }] : [];

/**
 * Whether the member may read tickets, from one ticket asked for at most every few minutes, so
 * the inbox's rail knows without asking for each customer's tickets. Tickets have no access
 * procedure of their own.
 */
export const useTicketsReadable = () => {
  const { error } = useQuery(
    orpc.tickets.list.queryOptions({ input: { limit: 1 }, staleTime: REFERENCE_MS, retry: false }),
  );

  return !(error instanceof ORPCError && error.code === 'FORBIDDEN');
};

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

/**
 * The Tickets tab on a customer's or company's panel, and the inbox's customer sidebar: the
 * member's tickets about them. One opens on top in core's side panel.
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
      </Empty>
    );
  }

  return (
    <ul className="flex flex-col gap-1 p-2">
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
