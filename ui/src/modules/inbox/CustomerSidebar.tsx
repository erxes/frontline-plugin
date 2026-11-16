import { contactQueries } from '@erxes/core-contract/client';
import { ORPCError } from '@orpc/client';
import { IconMail, IconMessages, IconPhone, IconTicket, IconUser } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  ContactLink,
  IconTip,
  PanelSection,
  RelativeDateDisplay,
  stored,
} from 'erxes-ui';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { InfoRow } from '~/shared/Panel.tsx';
import { TicketRelations, useContactTickets } from '@/tickets/TicketRelations.tsx';
import { useSelectConversation } from './ConversationList.tsx';
import { VisitorPresence } from './ConversationPresence.tsx';
import { useStatusNames } from './InboxFilter.tsx';
import type { Conversation } from './queries.ts';

/**
 * Who the customer is: their chip, which opens them in core's side panel, how to reach them and,
 * for a messenger visitor, whether they are online.
 */
const Customer = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const { customerId } = conversation;
  const customer = useQuery(contactQueries.customer(customerId)).data;

  return (
    <PanelSection title={t('customer', 'Customer')} icon={IconUser}>
      <ContactLink
        contentType="core:customer"
        contentId={customerId}
        contacts={contactQueries}
        placeholder={t('visitor', 'Visitor')}
      />
      <VisitorPresence conversation={conversation} />
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

const PANELS = ['customer', 'tickets', 'conversations'] as const;

/** The panel open beside the conversation, or none, as the old inbox started. */
const openPanel = stored({
  key: `${PLUGIN}:inbox-panel`,
  schema: z.enum(PANELS).nullable(),
  initial: null,
});

/**
 * Beside the open conversation, as the old inbox's side widget: a thin rail of icons, each
 * opening one panel, the customer, their tickets or their other conversations. Tickets shows
 * only to a member who may read them.
 */
export const CustomerSidebar = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const [panel, setPanel] = useAtom(openPanel);
  const contacts = { customerIds: [conversation.customerId], companyIds: [] };
  const { error } = useContactTickets(contacts);
  const ticketsAllowed = !(error instanceof ORPCError && error.code === 'FORBIDDEN');

  const rail = (
    [
      { id: 'customer', icon: IconUser, label: t('customer', 'Customer') },
      { id: 'tickets', icon: IconTicket, label: t('tickets', 'Tickets') },
      {
        id: 'conversations',
        icon: IconMessages,
        label: t('other-conversations', 'Other conversations'),
      },
    ] as const
  ).filter((item) => item.id !== 'tickets' || ticketsAllowed);

  return (
    <>
      {panel && (panel !== 'tickets' || ticketsAllowed) && (
        <aside
          aria-label={t('customer-details', 'Customer details')}
          className="flex w-72 shrink-0 flex-col overflow-y-auto border-l"
        >
          {panel === 'customer' && <Customer conversation={conversation} />}
          {panel === 'tickets' && (
            <PanelSection title={t('tickets', 'Tickets')} icon={IconTicket}>
              <TicketRelations {...contacts} />
            </PanelSection>
          )}
          {panel === 'conversations' && <OtherConversations conversation={conversation} />}
        </aside>
      )}
      <div
        role="toolbar"
        aria-orientation="vertical"
        aria-label={t('customer-panels', 'Customer panels')}
        className="flex shrink-0 flex-col items-center gap-1 border-l p-1"
      >
        {rail.map(({ id, icon: Icon, label }) => (
          <IconTip key={id} label={label}>
            <Button
              variant={panel === id ? 'secondary' : 'ghost'}
              size="icon"
              aria-label={label}
              aria-pressed={panel === id}
              onClick={() => setPanel(panel === id ? null : id)}
            >
              <Icon />
            </Button>
          </IconTip>
        ))}
      </div>
    </>
  );
};
