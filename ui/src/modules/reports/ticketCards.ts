// The ticket page's cards.
import {
  cardsOf,
  CHART,
  fromReport,
  type Labels,
  pipelineOf,
  useTicketsData,
  usePropertiesData,
} from './cardKit.ts';
import type { Figures } from './figures.tsx';
import type { InferClientOutputs } from '@orpc/client';
import type { Client } from '@frontline/api';
import type { TConditionGroup } from 'erxes-ui';
import { shareOf } from './Tile.tsx';

type Reports = InferClientOutputs<Client>['reports'];

/** The period's new tickets by the status they are in now: the one pipeline's in its colours, else by stage. */
const statusRows = (
  report: Reports['tickets'],
  labels: Labels,
  filter: TConditionGroup | null,
): Figures => {
  const pipelineId = pipelineOf(filter);
  const counts = new Map(report.statuses.map((row) => [row.statusId, row.count]));

  const rows = pipelineId
    ? labels.statuses
        .filter((status) => status.pipelineId === pipelineId)
        .map((status) => ({
          key: status.id,
          label: status.name,
          name: status.name,
          value: counts.get(status.id) ?? 0,
          color: status.color,
        }))
    : report.stages.map(({ type, count }) => {
        const name = labels.stages.find((stage) => stage.type === type)?.label ?? String(type);

        return { key: String(type), label: name, name, value: count };
      });

  return { type: 'rows', rows: rows.some((row) => row.value > 0) ? rows : [] };
};

/** How the period's new tickets keep their SLA, per clock. */
const slaTable = (report: Reports['tickets'], { t }: Labels): Figures => {
  const count = (clock: string, state: string) =>
    report.sla.find((row) => row.clock === clock && row.state === state)?.count ?? 0;

  const clocks = [
    ['firstResponse', t('first-response', 'First response')],
    ['resolution', t('resolution', 'Resolution')],
  ] as const;

  return {
    type: 'table',
    heads: [
      t('sla', 'SLA'),
      t('sla-met', 'Met'),
      t('sla-missed', 'Missed'),
      t('sla-overdue', 'Overdue'),
      t('met-share', 'Met share'),
    ],
    rows:
      report.sla.length === 0
        ? []
        : clocks.map(([clock, label]) => {
            const met = count(clock, 'met');
            const missed = count(clock, 'missed');

            return {
              key: clock,
              cells: [label, met, missed, count(clock, 'overdue'), shareOf(met, met + missed)],
            };
          }),
  };
};

/** The ticket page's cards. */
export const TICKET_CARDS = cardsOf(
  'tickets',
  'tickets',
  ['list'],
  [
    {
      kind: 'tickets-over-time',
      title: ['tickets-over-time', 'Tickets over time'],
      empty: ['no-tickets-in-period', 'No tickets in this period.'],
      draws: 'series',
      Body: fromReport(useTicketsData, (report, { t }) => ({
        type: 'series',
        days: report.days,
        config: {
          created: { label: t('tickets-created', 'Created'), color: CHART[0] },
          resolved: { label: t('tickets-resolved', 'Resolved'), color: CHART[1] },
        },
      })),
    },
    {
      kind: 'tickets-by-stage',
      title: ['tickets-by-stage', 'Tickets by status'],
      empty: ['no-tickets-in-period', 'No tickets in this period.'],
      draws: 'rows',
      Body: fromReport(useTicketsData, statusRows),
    },
    {
      kind: 'tickets-by-priority',
      title: ['tickets-by-priority', 'Tickets by priority'],
      empty: ['no-tickets-in-period', 'No tickets in this period.'],
      draws: 'rows',
      Body: fromReport(useTicketsData, (report, { priorities }) => ({
        type: 'rows',
        rows: report.priorities.map(({ priority, count }) => {
          const name = priorities[priority] ?? String(priority);

          return { key: String(priority), label: name, name, value: count };
        }),
      })),
    },
    {
      kind: 'tickets-by-tag',
      title: ['tickets-by-tag', 'Tickets by tag'],
      empty: ['no-tagged-tickets', 'No tagged tickets in this period.'],
      draws: 'rows',
      Body: fromReport(useTicketsData, (report) => ({
        type: 'rows',
        rows: report.tags.map((tag) => ({
          key: tag.tagId,
          label: tag.name,
          name: tag.name,
          value: tag.count,
          color: tag.colorCode,
        })),
      })),
    },
    {
      kind: 'tickets-by-property',
      title: ['tickets-by-property', 'Tickets by property'],
      empty: ['no-property-values', 'No ticket in this period has a value in this field.'],
      draws: 'rows',
      property: true,
      Body: fromReport(usePropertiesData, (rows) => ({
        type: 'rows',
        rows: rows.map(({ value, count }) => ({
          key: value,
          label: value,
          name: value,
          value: count,
        })),
      })),
    },
    {
      kind: 'ticket-sla',
      title: ['ticket-sla', 'Ticket SLA'],
      empty: ['no-sla-tickets', 'No ticket in this period had an SLA.'],
      draws: 'table',
      Body: fromReport(useTicketsData, slaTable),
    },
    {
      kind: 'tickets-by-assignee',
      title: ['tickets-by-assignee', 'Open tickets by assignee'],
      empty: ['no-open-tickets', 'No unresolved tickets.'],
      draws: 'table',
      Body: fromReport(useTicketsData, (report, { t }) => ({
        type: 'table',
        heads: [t('assignee', 'Assignee'), t('tickets-unresolved', 'Open now')],
        rows: report.assignees.map((row) => ({
          key: row.userId ?? 'nobody',
          cells: [{ member: row.userId }, row.count],
        })),
      })),
    },
    {
      kind: 'ticket-list',
      title: ['ticket-list', 'Tickets'],
      empty: ['no-tickets-in-period', 'No tickets in this period.'],
      draws: 'list',
    },
  ],
);
