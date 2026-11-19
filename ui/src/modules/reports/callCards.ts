// The call page's cards.
import { cardsOf, CHART, fromReport, useCallsData } from './cardKit.ts';
import { durationText } from '@/calls/queries.ts';
import { percentText, shareOf } from './Tile.tsx';

/** The call page's cards. */
export const CALL_CARDS = cardsOf(
  'calls',
  'calls',
  ['series', 'heatmap', 'list'],
  [
    {
      kind: 'call-volume',
      title: ['call-volume', 'Call volume'],
      empty: ['no-calls-in-period', 'No calls in this period.'],
      draws: 'series',
      Body: fromReport(useCallsData, (report, { t }) => ({
        type: 'series',
        days: report.days,
        config: {
          incoming: { label: t('incoming', 'Incoming'), color: CHART[0] },
          outgoing: { label: t('outgoing', 'Outgoing'), color: CHART[1] },
          missed: { label: t('missed-calls', 'Missed'), color: CHART[4] },
        },
      })),
    },
    {
      kind: 'call-heatmap',
      title: ['calls-by-hour', 'Calls by hour'],
      empty: ['no-calls-in-period', 'No calls in this period.'],
      draws: 'heatmap',
      Body: fromReport(useCallsData, (report) => ({ type: 'heatmap', cells: report.hours })),
    },
    {
      kind: 'call-agents',
      title: ['top-agents', 'Top agents'],
      empty: ['no-answered-calls', 'No member answered a call in this period.'],
      draws: 'table',
      Body: fromReport(useCallsData, (report, { t }) => ({
        type: 'table',
        heads: [
          t('agent', 'Agent'),
          t('answered-calls', 'Answered'),
          t('talk-time', 'Talk time'),
          t('average-talk-time', 'Average talk'),
          t('shortest-call', 'Shortest call'),
          t('longest-call', 'Longest call'),
        ],
        rows: report.agents.map((row) => ({
          key: row.userId,
          cells: [
            { member: row.userId },
            row.answered,
            durationText(row.talkSeconds),
            durationText(Math.round(row.talkSeconds / row.answered)),
            durationText(row.shortestSeconds),
            durationText(row.longestSeconds),
          ],
        })),
      })),
    },
    {
      kind: 'call-queues',
      title: ['calls-by-queue', 'Calls by queue'],
      empty: ['no-queue-calls', 'No call came through a queue in this period.'],
      draws: 'table',
      Body: fromReport(useCallsData, (report, { t, span }) => ({
        type: 'table',
        heads: [
          t('queue', 'Queue'),
          t('calls', 'Calls'),
          t('answered-calls', 'Answered'),
          t('missed-calls', 'Missed'),
          t('average-wait', 'Average wait'),
        ],
        rows: report.queues.map((row) => ({
          key: row.queue,
          cells: [row.queue, row.total, row.answered, row.missed, span(row.waitSeconds)],
        })),
      })),
    },
    {
      kind: 'call-numbers',
      title: ['top-numbers', 'Top numbers'],
      empty: ['no-calls-in-period', 'No calls in this period.'],
      draws: 'table',
      Body: fromReport(useCallsData, (report, { t }) => ({
        type: 'table',
        heads: [
          t('number', 'Number'),
          t('calls', 'Calls'),
          t('answered-calls', 'Answered'),
          t('missed-calls', 'Missed'),
        ],
        rows: report.numbers.map((row) => ({
          key: row.customerPhone,
          cells: [row.customerPhone, row.total, row.answered, row.missed],
        })),
      })),
    },
    {
      kind: 'call-service',
      title: ['call-service', 'Service level'],
      empty: ['no-calls-in-period', 'No calls in this period.'],
      draws: 'table',
      Body: fromReport(useCallsData, (report, { t, span }) => ({
        type: 'table',
        heads: [t('meta-measure', 'Measure'), t('value', 'Value')],
        rows:
          report.total === 0
            ? []
            : [
                ['service', t('service-level', 'Service level'), percentText(report.serviceLevel)],
                [
                  'answer-rate',
                  t('answer-rate', 'Answer rate'),
                  shareOf(report.answeredIncoming, report.incoming),
                ],
                [
                  'missed',
                  t('missed-share', 'Missed of incoming'),
                  shareOf(report.missed, report.incoming),
                ],
                ['wait', t('average-wait', 'Average wait'), span(report.waitSeconds)],
                ['talk', t('talk-time', 'Talk time'), span(report.talkSeconds)],
                [
                  'called-back',
                  t('called-back', 'Called back within {{count}} h', {
                    count: report.callbackHours,
                  }),
                  report.calledBack,
                ],
                ['reached', t('callbacks-reached-count', 'Reached on callback'), report.reached],
              ].map(([key, name, value]) => ({
                key: String(key),
                cells: [String(name), value ?? ''],
              })),
      })),
    },
  ],
);
