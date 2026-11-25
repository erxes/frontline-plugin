import { IconPhoneX } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { TicketChip } from '@/inbox/ConversationTickets.tsx';
import { orpc } from '~/orpc.ts';
import type { CurrentCall } from './current.ts';

/** How many of the caller's open tickets show; the rest wait in their record. */
const TICKETS = 3;

/**
 * What the member should know before they pick up: how often the caller rang unanswered since
 * anyone talked to them, and their open tickets, each opening in core's panel. Nothing while
 * there's neither, and no tickets for a member who may not see them.
 */
export const CallerContext = ({ call }: { call: NonNullable<CurrentCall> }) => {
  const { t } = useTranslation('frontline');

  const missed =
    useQuery(
      orpc.calls.callbacks.list.queryOptions({
        input: { customerPhone: call.customerPhone, limit: 1 },
      }),
    ).data?.calls[0]?.missedCount ?? 0;

  const filter = {
    match: 'all',
    rules: [
      { path: 'subject.customerId', op: 'eq', value: call.customerId },
      { path: 'subject.state', op: 'in', value: ['active'] },
    ],
  };

  const tickets =
    useQuery({
      ...orpc.tickets.list.queryOptions({
        input: { filter: JSON.stringify(filter), limit: TICKETS },
      }),
      retry: false,
    }).data?.tickets ?? [];

  if (missed === 0 && tickets.length === 0) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted p-2 text-sm">
      {missed > 0 && (
        <span className="flex items-center gap-1.5 text-warning-text">
          <IconPhoneX className="size-4" />
          {t('missed-before', 'Rang {{count}} times unanswered', { count: missed })}
        </span>
      )}
      {tickets.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {t('customer-open-tickets', 'Open tickets')}
          </span>
          <div className="flex flex-wrap gap-1">
            {tickets.map((ticket) => (
              <TicketChip key={ticket.id} ticket={ticket} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
