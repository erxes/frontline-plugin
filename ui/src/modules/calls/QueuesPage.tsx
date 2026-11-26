import {
  IconClockPause,
  IconClockPlay,
  IconHeadset,
  IconPercentage,
  IconPhoneCall,
  IconPhoneCheck,
  IconPhoneOff,
  IconPhoneOutgoing,
  IconUsersGroup,
} from '@tabler/icons-react';
import {
  Button,
  buttonVariants,
  PageContainer,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  useFormat,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ListEmpty, ListError } from '~/shared/List.tsx';
import { TextCell } from '~/shared/Records.tsx';
import { column as columnOf, DateCell, Rows } from '~/shared/Table.tsx';
import { CallsHeader } from './CallsHeader.tsx';
import { CALLS_PATH, durationText, type Queue, useAgents, useQueues } from './queries.ts';

const column = columnOf<Queue>;

/** A counter the PBX sent, right-aligned. */
const NumberCell = ({ value }: { value: string }) => (
  <RecordTableInlineCell>
    <span className="ml-auto tabular-nums">{value}</span>
  </RecordTableInlineCell>
);

/** The queue's name, leading to its live board. */
const QueueName = ({ queue }: { queue: Queue }) => (
  <Link
    to={`${CALLS_PATH}/queues/${encodeURIComponent(queue.id)}`}
    className={buttonVariants({ variant: 'ghost', className: 'w-full min-w-0 justify-start' })}
  >
    <span className="truncate">{queue.name || queue.queue}</span>
    {queue.name && queue.name !== queue.queue && (
      <span className="text-muted-foreground text-xs tabular-nums">{queue.queue}</span>
    )}
  </Link>
);

/** What each queue handled today, as its PBX last counted. */
const useColumns = (): RecordTableColumnDef<Queue>[] => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  return [
    column('name', t('queue', 'Queue'), IconUsersGroup, 220, (queue) => (
      <RecordTableInlineCell>
        <QueueName queue={queue} />
      </RecordTableInlineCell>
    )),
    column('line', t('line', 'Line'), IconPhoneCall, 140, (queue) => (
      <TextCell value={queue.accountName} />
    )),
    column('totalCalls', t('total-calls', 'Total'), IconPhoneCall, 90, (queue) => (
      <NumberCell value={format.number(queue.totalCalls)} />
    )),
    column('answeredCalls', t('answered-calls', 'Answered'), IconPhoneCheck, 100, (queue) => (
      <NumberCell value={format.number(queue.answeredCalls)} />
    )),
    column('abandonedCalls', t('abandoned-calls', 'Abandoned'), IconPhoneOff, 110, (queue) => (
      <NumberCell value={format.number(queue.abandonedCalls)} />
    )),
    column(
      'transferredCalls',
      t('transferred-calls', 'Transferred'),
      IconPhoneOutgoing,
      110,
      (queue) => <NumberCell value={format.number(queue.transferredCalls)} />,
    ),
    column('avgWait', t('average-wait', 'Average wait'), IconClockPause, 120, (queue) => (
      <NumberCell value={durationText(queue.avgWait)} />
    )),
    column('avgTalk', t('average-talk', 'Average talk'), IconClockPlay, 120, (queue) => (
      <NumberCell value={durationText(queue.avgTalk)} />
    )),
    column('slaRate', t('sla-rate', 'Service level'), IconPercentage, 120, (queue) => (
      <NumberCell value={`${format.number(queue.slaRate)}%`} />
    )),
    column('statsAt', t('counted-at', 'Counted'), IconHeadset, 130, (queue) =>
      queue.statsAt ? <DateCell date={queue.statsAt} /> : <RecordTableInlineCell />,
    ),
  ];
};

/**
 * The member's own state in their PBX's queues: Pause stops queue calls reaching their
 * extension, Resume lets them in again. Nothing for a member with no extension.
 */
export const AgentStatus = () => {
  const { t } = useTranslation('frontline');
  const { agents, setStatus } = useAgents();
  const format = useFormat();

  return agents.map((agent) => {
    const paused = agent.status === 'paused';
    const line = agents.length > 1 ? ` · ${agent.accountName}` : '';

    return (
      <div key={agent.id} className="flex items-center gap-2">
        {agent.heardAt && (
          <span
            className="text-muted-foreground text-xs tabular-nums"
            title={t('agent-heard-at', 'As the PBX counted at {{time}}', {
              time: format.dateTime(agent.heardAt),
            })}
          >
            {t('agent-today', 'Today {{answered}} answered · {{abandoned}} missed · {{talk}}', {
              answered: agent.answered,
              abandoned: agent.abandoned,
              talk: durationText(agent.talkSeconds),
            })}
          </span>
        )}
        <Button
          variant={paused ? 'default' : 'secondary'}
          disabled={setStatus.isPending}
          onClick={() =>
            setStatus.mutate({
              accountId: agent.accountId,
              status: paused ? 'available' : 'paused',
            })
          }
        >
          {paused ? <IconClockPlay /> : <IconClockPause />}
          {paused
            ? t('resume-calls', 'Resume calls ({{extension}})', { extension: agent.extension })
            : t('pause-calls', 'Pause calls ({{extension}})', { extension: agent.extension })}
          {line}
        </Button>
      </div>
    );
  });
};

/** The old calls dashboard: every queue of the PBXs the member answers, with today's counters. */
export const QueuesPage = () => {
  const { t } = useTranslation('frontline');
  const { data = [], isPending, error } = useQueues();
  const columns = useColumns();

  return (
    <PageContainer>
      <CallsHeader levels={[{ label: t('queues', 'Queues') }]}>
        <AgentStatus />
      </CallsHeader>
      {error ? (
        <ListError error={error} />
      ) : !isPending && data.length === 0 ? (
        <ListEmpty
          icon={<IconUsersGroup />}
          title={t('no-queues-yet', 'No queues yet')}
          description={t(
            'no-queues-description',
            "The queues of the PBXs you answer show here, with each day's calls.",
          )}
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_call_queues"
          columns={columns}
          data={data}
          stickyColumns={['name']}
          className="m-3"
        >
          <Rows isPending={isPending} skeletons={4} />
        </RecordTable.Provider>
      )}
    </PageContainer>
  );
};
