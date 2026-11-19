// The call page's service cards: who was served, who wasn't and why, and the list of calls.
import { durationText } from '@/calls/queries.ts';
import { cardsOf, CHART, fromReport, useCallsData } from './cardKit.ts';
import { shareOf } from './Tile.tsx';

/** The call page's cards on the service callers got, then its list of calls. */
export const CALL_SERVICE_CARDS = cardsOf(
  'calls',
  'calls',
  ['list'],
  [
    {
      kind: 'call-service-days',
      title: ['call-service-days', 'Served and breached calls'],
      empty: ['no-incoming-calls', 'No incoming calls in this period.'],
      draws: 'series',
      Body: fromReport(useCallsData, (report, { t }) => ({
        type: 'series',
        days: report.serviceDays,
        config: {
          served: { label: t('calls-served', 'Served'), color: CHART[1] },
          breached: { label: t('calls-breached', 'Breached'), color: CHART[4] },
        },
      })),
    },
    {
      kind: 'call-missed-reasons',
      title: ['call-missed-reasons', 'Why calls were missed'],
      empty: ['no-missed-calls', 'No missed calls in this period.'],
      draws: 'rows',
      Body: fromReport(useCallsData, (report, { t }) => {
        const names = {
          short: t('call-short-hangup', 'Hung up within {{count}} s', {
            count: report.shortHangupSeconds,
          }),
          missed: t('call-no-answer', 'No answer'),
          busy: t('call-busy', 'Busy'),
          failed: t('call-failed', 'Failed'),
          voicemail: t('call-voicemail', 'Voicemail'),
        };

        return {
          type: 'rows',
          rows: report.missedReasons.map(({ reason, count }) => ({
            key: reason,
            label: names[reason],
            name: names[reason],
            value: count,
          })),
        };
      }),
    },
    {
      kind: 'call-service-queues',
      title: ['call-service-queues', 'Service by queue'],
      empty: ['no-incoming-calls', 'No incoming calls in this period.'],
      draws: 'table',
      Body: fromReport(useCallsData, (report, { t }) => ({
        type: 'table',
        heads: [
          t('queue', 'Queue'),
          t('calls-offered', 'Offered'),
          t('calls-served', 'Served'),
          t('calls-breached', 'Breached'),
          t('calls-called-back', 'Called back'),
          t('service-level', 'Service level'),
        ],
        rows: report.serviceQueues.map((row) => ({
          key: row.queue,
          cells: [
            row.queue || t('no-queue', 'No queue'),
            row.offered,
            row.served,
            row.breached,
            row.calledBack,
            shareOf(row.served, row.offered),
          ],
        })),
      })),
    },
    {
      kind: 'call-callbacks',
      title: ['call-callbacks', 'Callback recovery'],
      empty: ['no-missed-calls', 'No missed calls in this period.'],
      draws: 'table',
      Body: fromReport(useCallsData, (report, { t, span }) => ({
        type: 'table',
        heads: [t('meta-measure', 'Measure'), t('value', 'Value')],
        rows:
          report.missed === 0
            ? []
            : [
                ['missed', t('missed-calls', 'Missed'), report.missed],
                ['attempts', t('callback-attempts', 'Called back'), report.calledBack],
                ['reached', t('callbacks-reached-count', 'Reached on callback'), report.reached],
                [
                  'recovery',
                  t('recovery-rate', 'Recovery rate'),
                  shareOf(report.reached, report.missed),
                ],
                ['pending', t('callbacks-pending', 'Still to call back'), report.service.pending],
                [
                  'time',
                  t('callback-time', 'Average time to call back'),
                  span(report.callbackSeconds),
                ],
              ].map(([key, name, value]) => ({
                key: String(key),
                cells: [String(name), value ?? ''],
              })),
      })),
    },
    {
      kind: 'call-breaches',
      title: ['call-breaches', 'Calls nobody served'],
      empty: ['no-breaches', 'Every offered call was answered or called back.'],
      draws: 'table',
      Body: fromReport(useCallsData, (report, { t, date }) => ({
        type: 'table',
        heads: [
          t('number', 'Number'),
          t('started-at', 'Started at'),
          t('queue', 'Queue'),
          t('waited', 'Waited'),
          t('callback', 'Callback'),
        ],
        rows: report.breaches.map((row) => ({
          key: row.id,
          cells: [
            row.customerPhone,
            date(row.startedAt),
            row.queue ?? '',
            durationText(row.waitSeconds),
            row.pending
              ? t('callback-pending', 'Pending')
              : t('callback-missed', 'Not called back'),
          ],
        })),
      })),
    },
    {
      kind: 'call-list',
      title: ['call-list', 'Calls'],
      empty: ['no-calls-in-period', 'No calls in this period.'],
      draws: 'list',
    },
  ],
);
