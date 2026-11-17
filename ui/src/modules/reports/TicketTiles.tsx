import { useFormat } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { usePriorityNames, useStages } from '@/pipelines/queries.ts';
import { DayChart } from './Charts.tsx';
import { useTicketReport } from './queries.ts';
import { BarList, Stat, Stats, Tile, useSpanText } from './Tile.tsx';

/** Created, resolved, open and overdue tickets, and how long resolving took. */
export const TicketSummary = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const span = useSpanText();
  const { period, query } = useTicketReport();

  return (
    <Tile period={period} query={query}>
      {(report) => (
        <Stats>
          <Stat label={t('tickets-created', 'Created')} value={format.number(report.created)} />
          <Stat label={t('tickets-resolved', 'Resolved')} value={format.number(report.resolved)} />
          <Stat
            label={t('tickets-unresolved', 'Open now')}
            value={format.number(report.unresolved)}
          />
          <Stat
            label={t('tickets-overdue', 'Overdue now')}
            value={format.number(report.overdue)}
            hint={t('past-sla', 'Past an SLA due time')}
          />
          <Stat
            label={t('average-resolution', 'Average resolution')}
            value={span(report.resolutionSeconds)}
          />
        </Stats>
      )}
    </Tile>
  );
};

/** Tickets created and resolved each day. */
export const TicketsOverTime = () => {
  const { t } = useTranslation('frontline');
  const { period, query } = useTicketReport();

  return (
    <Tile period={period} query={query}>
      {(report) => (
        <DayChart
          days={report.days}
          config={{
            created: { label: t('tickets-created', 'Created'), color: 'var(--chart-1)' },
            resolved: { label: t('tickets-resolved', 'Resolved'), color: 'var(--chart-2)' },
          }}
          empty={t('no-tickets-in-period', 'No tickets in this period.')}
        />
      )}
    </Tile>
  );
};

/** The period's new tickets by the stage they are in now. */
export const TicketsByStage = () => {
  const { t } = useTranslation('frontline');
  const stages = useStages();
  const { period, query } = useTicketReport();

  return (
    <Tile period={period} query={query}>
      {(report) => (
        <BarList
          rows={report.stages.map(({ type, count }) => {
            const name = stages.find((stage) => stage.type === type)?.label ?? String(type);

            return { key: String(type), label: name, name, value: count };
          })}
          empty={t('no-tickets-in-period', 'No tickets in this period.')}
        />
      )}
    </Tile>
  );
};

/** The period's new tickets by priority, critical first. */
export const TicketsByPriority = () => {
  const { t } = useTranslation('frontline');
  const priorities = usePriorityNames();
  const { period, query } = useTicketReport();

  return (
    <Tile period={period} query={query}>
      {(report) => (
        <BarList
          rows={report.priorities.map(({ priority, count }) => {
            const name = priorities[priority] ?? String(priority);

            return { key: String(priority), label: name, name, value: count };
          })}
          empty={t('no-tickets-in-period', 'No tickets in this period.')}
        />
      )}
    </Tile>
  );
};

/** The tags on the period's new tickets, the most used first. */
export const TicketsByTag = () => {
  const { t } = useTranslation('frontline');
  const { period, query } = useTicketReport();

  return (
    <Tile period={period} query={query}>
      {(report) => (
        <BarList
          rows={report.tags.map((tag) => ({
            key: tag.tagId,
            label: tag.name,
            name: tag.name,
            value: tag.count,
            color: tag.colorCode,
          }))}
          empty={t('no-tagged-tickets', 'No tagged tickets in this period.')}
        />
      )}
    </Tile>
  );
};
