import { contactQueries } from '@erxes/core-contract/client';
import { ORPCError } from '@orpc/client';
import { IconMail, IconMessages, IconPhone, IconTicket, IconUser } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Badge, ContactLink, PanelSection, RelativeDateDisplay } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { InfoRow } from '~/shared/Panel.tsx';
import { TicketRelations, useContactTickets } from '@/tickets/TicketRelations.tsx';
import { useSelectConversation } from './ConversationList.tsx';
import { useStatusNames } from './InboxFilter.tsx';
import type { Conversation } from './queries.ts';

/** Who the customer is: their chip, which opens them in core's side panel, and how to reach them. */
const Customer = ({ customerId }: { customerId: string }) => {
  const { t } = useTranslation('frontline');
  const customer = useQuery(contactQueries.customer(customerId)).data;

  return (
    <PanelSection title={t('customer', 'Customer')} icon={IconUser}>
      <ContactLink
        contentType="core:customer"
        contentId={customerId}
        contacts={contactQueries}
        placeholder={t('visitor', 'Visitor')}
      />
      {customer?.primaryEmail && (
        <InfoRow icon={IconMail} label={t('email', 'Email')}>
          <span className="truncate">{customer.primaryEmail}</span>
        </InfoRow>
      )}
      {customer?.primaryPhone && (
        <InfoRow icon={IconPhone} label={t('phone', 'Phone')}>
          {customer.primaryPhone}
        </InfoRow>
      )}
    </PanelSection>
  );
};

/** The customer's tickets, for a member who may read tickets. */
const Tickets = ({ customerId }: { customerId: string }) => {
  const { t } = useTranslation('frontline');
  const contacts = { customerIds: [customerId], companyIds: [] };
  const { error } = useContactTickets(contacts);

  if (error instanceof ORPCError && error.code === 'FORBIDDEN') return null;

  return (
    <PanelSection title={t('tickets', 'Tickets')} icon={IconTicket}>
      <TicketRelations {...contacts} />
    </PanelSection>
  );
};

/** The customer's other conversations in the member's channels, resolved ones too. */
const OtherConversations = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const statuses = useStatusNames();
  const select = useSelectConversation();

  const filter = {
    match: 'all',
    rules: [
      { path: 'subject.customerId', op: 'in', value: [conversation.customerId] },
      { path: 'subject.status', op: 'in', value: ['new', 'open', 'resolved'] },
    ],
  };

  const others = (
    useQuery(
      orpc.conversations.list.queryOptions({
        input: { filter: JSON.stringify(filter), limit: 20 },
      }),
    ).data?.conversations ?? []
  ).filter((other) => other.id !== conversation.id);

  return (
    <PanelSection title={t('other-conversations', 'Other conversations')} icon={IconMessages}>
      {others.length === 0 ? (
        <p className="px-2 text-xs text-muted-foreground">
          {t('no-other-conversations', 'No other conversations')}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {others.map((other) => (
            <li key={other.id}>
              <button
                type="button"
                onClick={() => select(other)}
                className="flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left hover:bg-accent"
              >
                <span className="truncate text-sm">{other.content}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={other.status === 'new' ? 'info' : 'secondary'}>
                    {statuses[other.status]}
                  </Badge>
                  <RelativeDateDisplay.Value value={other.lastMessageAt.toISOString()} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </PanelSection>
  );
};

/**
 * Beside the open conversation, as the old inbox's side widget: the customer, their tickets and
 * their other conversations.
 */
export const CustomerSidebar = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');

  return (
    <aside
      aria-label={t('customer-details', 'Customer details')}
      className="hidden w-72 shrink-0 flex-col overflow-y-auto border-l lg:flex"
    >
      <Customer customerId={conversation.customerId} />
      <Tickets customerId={conversation.customerId} />
      <OtherConversations conversation={conversation} />
    </aside>
  );
};
