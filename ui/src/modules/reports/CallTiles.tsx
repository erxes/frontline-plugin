import { useFormat } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { MemberLine } from '~/shared/Person.tsx';
import { durationText } from '@/calls/queries.ts';
import { DayChart, Heatmap } from './Charts.tsx';
import { useCallReport } from './queries.ts';
import { MiniTable, percentText, Stat, Stats, Tile, useSpanText } from './Tile.tsx';

/** Calls, answers and misses, the service level, and how long callers waited and talked. */
export const CallSummary = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const span = useSpanText();
  const { period, pick, query } = useCallReport('call-summary');

  return (
    <Tile period={period} pick={pick} query={query}>
      {(report) => (
        <Stats>
          <Stat
            label={t('calls', 'Calls')}
            value={format.number(report.total)}
            hint={t('calls-in-out', '{{incoming}} in, {{outgoing}} out', {
              incoming: report.incoming,
              outgoing: report.outgoing,
            })}
          />
          <Stat label={t('answered-calls', 'Answered')} value={format.number(report.answered)} />
          <Stat label={t('missed-calls', 'Missed')} value={format.number(report.missed)} />
          <Stat
            label={t('service-level', 'Service level')}
            value={percentText(report.serviceLevel)}
            hint={t('answered-within', 'Answered within {{count}} s', {
              count: report.serviceLevelSeconds,
            })}
          />
          <Stat
            label={t('average-wait', 'Average wait')}
            value={span(report.waitSeconds)}
            hint={t('average-talk', 'Talk {{span}}', { span: span(report.talkSeconds) })}
          />
          <Stat
            label={t('called-back', 'Called back within {{count}} h', {
              count: report.callbackHours,
            })}
            value={format.number(report.calledBack)}
            hint={t('callbacks-reached', '{{reached}} reached, after {{span}}', {
              reached: report.reached,
              span: span(report.callbackSeconds),
            })}
          />
        </Stats>
      )}
    </Tile>
  );
};

/** Incoming, outgoing and missed calls each day. */
export const CallVolume = () => {
  const { t } = useTranslation('frontline');
  const { period, pick, query } = useCallReport('call-volume');

  return (
    <Tile period={period} pick={pick} query={query}>
      {(report) => (
        <DayChart
          days={report.days}
          config={{
            incoming: { label: t('incoming', 'Incoming'), color: 'var(--chart-1)' },
            outgoing: { label: t('outgoing', 'Outgoing'), color: 'var(--chart-2)' },
            missed: { label: t('missed-calls', 'Missed'), color: 'var(--chart-5)' },
          }}
          empty={t('no-calls-in-period', 'No calls in this period.')}
        />
      )}
    </Tile>
  );
};

/** When calls come: by weekday and hour in the member's time zone. */
export const CallHeatmap = () => {
  const { t } = useTranslation('frontline');
  const { period, pick, query } = useCallReport('call-heatmap');

  return (
    <Tile period={period} pick={pick} query={query}>
      {(report) => (
        <Heatmap cells={report.hours} empty={t('no-calls-in-period', 'No calls in this period.')} />
      )}
    </Tile>
  );
};

/** The members who answered the most calls, and how long they talked. */
export const CallAgents = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const { period, pick, query } = useCallReport('call-agents');

  return (
    <Tile period={period} pick={pick} query={query}>
      {(report) => (
        <MiniTable
          heads={[
            t('agent', 'Agent'),
            t('answered-calls', 'Answered'),
            t('talk-time', 'Talk time'),
          ]}
          rows={report.agents.map((row) => ({
            key: row.userId,
            lead: <MemberLine id={row.userId} />,
            numbers: [format.number(row.answered), durationText(row.talkSeconds)],
          }))}
          empty={t('no-answered-calls', 'No member answered a call in this period.')}
        />
      )}
    </Tile>
  );
};

/** Each PBX queue's incoming calls, answers, misses, wait and talk time. */
export const CallQueues = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const span = useSpanText();
  const { period, pick, query } = useCallReport('call-queues');

  return (
    <Tile period={period} pick={pick} query={query}>
      {(report) => (
        <MiniTable
          heads={[
            t('queue', 'Queue'),
            t('calls', 'Calls'),
            t('answered-calls', 'Answered'),
            t('missed-calls', 'Missed'),
            t('average-wait', 'Average wait'),
          ]}
          rows={report.queues.map((row) => ({
            key: row.queue,
            lead: row.queue,
            numbers: [
              format.number(row.total),
              format.number(row.answered),
              format.number(row.missed),
              span(row.waitSeconds),
            ],
          }))}
          empty={t('no-queue-calls', 'No call came through a queue in this period.')}
        />
      )}
    </Tile>
  );
};

/** The numbers that called or were called the most. */
export const CallNumbers = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const { period, pick, query } = useCallReport('call-numbers');

  return (
    <Tile period={period} pick={pick} query={query}>
      {(report) => (
        <MiniTable
          heads={[
            t('number', 'Number'),
            t('calls', 'Calls'),
            t('answered-calls', 'Answered'),
            t('missed-calls', 'Missed'),
          ]}
          rows={report.numbers.map((row) => ({
            key: row.customerPhone,
            lead: row.customerPhone,
            numbers: [
              format.number(row.total),
              format.number(row.answered),
              format.number(row.missed),
            ],
          }))}
          empty={t('no-calls-in-period', 'No calls in this period.')}
        />
      )}
    </Tile>
  );
};
