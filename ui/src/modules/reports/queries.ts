import { useQuery } from '@tanstack/react-query';
import { orpc } from '~/orpc.ts';
import { usePeriod } from './Tile.tsx';

/** The tile's period and the ticket report over it. */
export const useTicketReport = () => {
  const period = usePeriod();

  return { period, query: useQuery(orpc.reports.tickets.queryOptions({ input: period.range })) };
};

/** The tile's period and the conversation report over it. */
export const useConversationReport = () => {
  const period = usePeriod();

  return {
    period,
    query: useQuery(orpc.reports.conversations.queryOptions({ input: period.range })),
  };
};

/** The tile's period and the call report over it. */
export const useCallReport = () => {
  const period = usePeriod();

  return { period, query: useQuery(orpc.reports.calls.queryOptions({ input: period.range })) };
};
