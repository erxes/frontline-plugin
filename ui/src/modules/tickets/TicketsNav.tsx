import { IconLayoutKanban, IconTicket } from '@tabler/icons-react';
import type { QueryClient } from '@tanstack/react-query';
import { Sidebar } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { TICKETS_PATH, ticketsPath } from '~/shared/listPath.ts';
import { usePrefetch } from '~/shared/prefetch.ts';
import { ticketsPage } from '~/pages.ts';
import { prefetchTickets, useChoices, useTicketPipeline, useTicketsLive } from './queries.ts';

/** The tickets page at `to` and its first page of tickets, loading as the member points at a link. */
const loadTickets = (queryClient: QueryClient, to: string) =>
  Promise.all([ticketsPage(), prefetchTickets(queryClient, to)]);

/**
 * Tickets in the sidebar, and under it the member's pipelines when there are several, as the old
 * page picked one: each shows its own tickets, list or board. It sits in the layout on every
 * page, so it keeps loaded tickets live for all of them.
 */
export const TicketsNav = () => {
  const { t } = useTranslation('frontline');
  const { pathname } = useLocation();
  const { pipelines } = useChoices();
  const shown = useTicketPipeline();
  const prefetch = usePrefetch(loadTickets);
  const here = pathname === TICKETS_PATH || pathname.startsWith(`${TICKETS_PATH}/`);

  useTicketsLive();

  return (
    <Sidebar.MenuItem>
      <Sidebar.MenuButton
        isActive={here && pipelines.length < 2}
        render={<Link to={TICKETS_PATH} {...prefetch(TICKETS_PATH)} />}
      >
        <IconTicket />
        <span>{t('tickets', 'Tickets')}</span>
      </Sidebar.MenuButton>
      {pipelines.length > 1 && (
        <Sidebar.Sub>
          {pipelines.map((pipeline) => (
            <Sidebar.SubItem key={pipeline.id}>
              <Sidebar.SubButton
                isActive={here && shown?.id === pipeline.id}
                render={
                  <Link to={ticketsPath(pipeline.id)} {...prefetch(ticketsPath(pipeline.id))} />
                }
              >
                <IconLayoutKanban />
                <span className="min-w-0 truncate">{pipeline.name}</span>
              </Sidebar.SubButton>
            </Sidebar.SubItem>
          ))}
        </Sidebar.Sub>
      )}
    </Sidebar.MenuItem>
  );
};
