import { useQuery } from '@tanstack/react-query';
import { useFormat } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { usePriorityNames, useStages } from '@/pipelines/queries.ts';
import { choicesQuery } from '~/shared/reference.ts';
import { DayChart } from './Charts.tsx';
import { useTicketReport } from './queries.ts';
import { useTicketLinks } from './ticketLinks.ts';
import { BarList, Stat, Stats, Tile, useSpanText } from './Tile.tsx';

type TicketReport = NonNullable<ReturnType<typeof useTicketReport>['query']['data']>;

/**
 * Created, resolved, open and overdue tickets, each opening its tickets in the pipeline `links`
 * leads to, and how long resolving took.
 */
export const TicketStats = ({
  report,
  links,
}: {
  report: TicketReport;
  links: ReturnType<typeof useTicketLinks>;
}) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const span = useSpanText();

  return (
    <Stats>
      <Stat
        label={t('tickets-created', 'Created')}
        value={format.number(report.created)}
        to={links.created()}
      />
      <Stat
        label={t('tickets-resolved', 'Resolved')}
        value={format.number(report.resolved)}
        to={links.resolved()}
      />
      <Stat
        label={t('tickets-unresolved', 'Open now')}
        value={format.number(report.unresolved)}
        to={links.open()}
      />
      <Stat
        label={t('tickets-overdue', 'Overdue now')}
        value={format.number(report.overdue)}
        hint={t('past-sla', 'Past an SLA due time')}
        to={links.open({
          match: 'any',
          rules: [
            { path: 'subject.firstResponseSla', op: 'in', value: ['overdue'] },
            { path: 'subject.resolutionSla', op: 'in', value: ['overdue'] },
          ],
        })}
      />
      <Stat
        label={t('average-resolution', 'Average resolution')}
        value={span(report.resolutionSeconds)}
      />
    </Stats>
  );
};

/** The ticket numbers of `TicketStats` for the tile's period and pipeline. */
export const TicketSummary = () => {
  const ticketReport = useTicketReport('ticket-summary');
  const links = useTicketLinks(ticketReport.period.range, ticketReport.pick.id);

  return <Tile {...ticketReport}>{(report) => <TicketStats report={report} links={links} />}</Tile>;
};

/** Tickets created and resolved each day. */
export const TicketsOverTime = () => {
  const { t } = useTranslation('frontline');

  return (
    <Tile {...useTicketReport('tickets-over-time')}>
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

/**
 * The period's new tickets by the status they are in now, in the picked pipeline's order with
 * each status's colour; across every pipeline, by stage.
 */
export const TicketsByStatus = () => {
  const { t } = useTranslation('frontline');
  const stages = useStages();
  const statuses = useQuery(choicesQuery).data?.statuses ?? [];
  const report = useTicketReport('tickets-by-stage');
  const links = useTicketLinks(report.period.range, report.pick.id);
  const pipelineId = report.pick.id;

  const inStatuses = (ids: string[]) =>
    ids.length ? links.created({ path: 'subject.statusId', op: 'in', value: ids }) : undefined;

  return (
    <Tile {...report}>
      {(data) => {
        const counts = new Map(data.statuses.map((row) => [row.statusId, row.count]));

        const rows = pipelineId
          ? statuses
              .filter((status) => status.pipelineId === pipelineId)
              .map((status) => ({
                key: status.id,
                label: status.name,
                name: status.name,
                value: counts.get(status.id) ?? 0,
                color: status.color,
                to: inStatuses([status.id]),
              }))
          : data.stages.map(({ type, count }) => {
              const name = stages.find((stage) => stage.type === type)?.label ?? String(type);
              const ids = statuses.filter((status) => status.type === type).map(({ id }) => id);

              return { key: String(type), label: name, name, value: count, to: inStatuses(ids) };
            });

        return (
          <BarList
            rows={rows.some((row) => row.value > 0) ? rows : []}
            empty={t('no-tickets-in-period', 'No tickets in this period.')}
          />
        );
      }}
    </Tile>
  );
};

/** The period's new tickets by priority, critical first. */
export const TicketsByPriority = () => {
  const { t } = useTranslation('frontline');
  const priorities = usePriorityNames();
  const ticketReport = useTicketReport('tickets-by-priority');
  const links = useTicketLinks(ticketReport.period.range, ticketReport.pick.id);

  return (
    <Tile {...ticketReport}>
      {(report) => (
        <BarList
          rows={report.priorities.map(({ priority, count }) => {
            const name = priorities[priority] ?? String(priority);

            const to = links.created({
              path: 'subject.priority',
              op: 'in',
              value: [`${priority}`],
            });

            return { key: String(priority), label: name, name, value: count, to };
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
  const ticketReport = useTicketReport('tickets-by-tag');
  const links = useTicketLinks(ticketReport.period.range, ticketReport.pick.id);

  return (
    <Tile {...ticketReport}>
      {(report) => (
        <BarList
          rows={report.tags.map((tag) => ({
            key: tag.tagId,
            label: tag.name,
            name: tag.name,
            value: tag.count,
            color: tag.colorCode,
            to: links.created({ path: 'subject.tagIds', op: 'in', value: [tag.tagId] }),
          }))}
          empty={t('no-tagged-tickets', 'No tagged tickets in this period.')}
        />
      )}
    </Tile>
  );
};
