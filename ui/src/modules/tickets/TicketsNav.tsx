import { IconChevronRight, IconLayoutKanban, IconTicket } from '@tabler/icons-react';
import type { QueryClient } from '@tanstack/react-query';
import { cn, Sidebar, stored } from 'erxes-ui';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { PLUGIN } from '~/plugin.ts';
import { TICKETS_PATH, ticketsPath } from '~/shared/listPath.ts';
import { usePrefetch } from '~/shared/prefetch.ts';
import { ticketsPage } from '~/pages.ts';
import { prefetchTickets, useChoices, useTicketPipeline, useTicketsLive } from './queries.ts';

/** The tickets page at `to` and its first page of tickets, loading as the member points at a link. */
const loadTickets = (queryClient: QueryClient, to: string) =>
  Promise.all([ticketsPage(), prefetchTickets(queryClient, to)]);

/**
 * Whether the member opened or closed the pipelines under Tickets with its chevron, remembered in
 * the browser. Until they do, the pipelines show while a tickets page is open.
 */
const pipelinesOpen = stored({
  key: `${PLUGIN}:tickets-pipelines`,
  schema: z.boolean().nullable(),
  initial: null,
});

/**
 * Tickets in the sidebar, and under it the member's pipelines when there are several, as the old
 * page picked one: each shows its own tickets, list or board. A chevron folds the pipelines away,
 * and Tickets lights up while a folded pipeline is open. It sits in the layout on every page, so
 * it keeps loaded tickets live for all of them.
 */
export const TicketsNav = () => {
  const { t } = useTranslation('frontline');
  const { pathname } = useLocation();
  const { pipelines } = useChoices();
  const shown = useTicketPipeline();
  const prefetch = usePrefetch(loadTickets);
  const here = pathname === TICKETS_PATH || pathname.startsWith(`${TICKETS_PATH}/`);
  const [toggled, setToggled] = useAtom(pipelinesOpen);
  const hasPipelines = pipelines.length > 1;
  const open = hasPipelines && (toggled ?? here);

  useTicketsLive();

  return (
    <Sidebar.MenuItem>
      <Sidebar.MenuButton
        isActive={here && !open}
        render={<Link to={TICKETS_PATH} {...prefetch(TICKETS_PATH)} />}
      >
        <IconTicket />
        <span>{t('tickets', 'Tickets')}</span>
      </Sidebar.MenuButton>
      {hasPipelines && (
        <Sidebar.MenuAction
          aria-label={t('ticket-pipelines', 'Ticket pipelines')}
          aria-expanded={open}
          onClick={() => setToggled(!open)}
        >
          <IconChevronRight className={cn('transition-transform', open && 'rotate-90')} />
        </Sidebar.MenuAction>
      )}
      {open && (
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
