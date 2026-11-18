import { IconTicket } from '@tabler/icons-react';
import { Sidebar } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { TICKETS_PATH, ticketsPath } from '~/shared/listPath.ts';
import { useChoices, useTicketPipeline } from './queries.ts';

/**
 * Tickets in the sidebar, and under it the member's pipelines when there are several, as the old
 * page picked one: each shows its own tickets, list or board.
 */
export const TicketsNav = () => {
  const { t } = useTranslation('frontline');
  const { pathname } = useLocation();
  const { pipelines } = useChoices();
  const shown = useTicketPipeline();
  const here = pathname === TICKETS_PATH || pathname.startsWith(`${TICKETS_PATH}/`);

  return (
    <Sidebar.MenuItem>
      <Sidebar.MenuButton
        isActive={here && pipelines.length < 2}
        render={<Link to={TICKETS_PATH} />}
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
                render={<Link to={ticketsPath(pipeline.id)} />}
              >
                <span>{pipeline.name}</span>
              </Sidebar.SubButton>
            </Sidebar.SubItem>
          ))}
        </Sidebar.Sub>
      )}
    </Sidebar.MenuItem>
  );
};
