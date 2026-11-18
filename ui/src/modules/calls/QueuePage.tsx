import { Badge, InfoCard, PageContainer, ScrollArea, Skeleton, Table, useFormat } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { ListError } from '~/shared/List.tsx';
import { CallsHeader } from './CallsHeader.tsx';
import { AgentStatus } from './QueuesPage.tsx';
import { CALLS_PATH, durationText, type QueueLive, useQueue } from './queries.ts';

/** One of the day's counters as a dashboard tile. */
const Tile = ({ title, value }: { title: string; value: string }) => (
  <InfoCard title={title}>
    <InfoCard.Content>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
    </InfoCard.Content>
  </InfoCard>
);

/** A titled table of the queue's rows, or `empty` when it has none. */
const TableSection = ({
  title,
  heads,
  rows,
  empty,
}: {
  title: string;
  heads: string[];
  rows: { key: string; cells: ReactNode[] }[];
  empty: string;
}) => (
  <section className="flex flex-col gap-2 rounded-lg border bg-background p-4">
    <h2 className="flex items-center gap-2 text-base font-semibold">
      {title}
      <Badge variant="secondary">{rows.length}</Badge>
    </h2>
    {rows.length === 0 ? (
      <p className="py-2 text-sm text-muted-foreground">{empty}</p>
    ) : (
      <Table>
        <Table.Header>
          <Table.Row>
            {heads.map((head) => (
              <Table.Head key={head}>{head}</Table.Head>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.key}>
              {row.cells.map((cell, index) => (
                <Table.Cell key={heads[index]}>{cell}</Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
    )}
  </section>
);

/** Who is in the queue, who waits and who talks, as the PBX last sent it. */
const LiveBoard = ({ live }: { live: QueueLive }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  return (
    <>
      <TableSection
        title={t('agents', 'Agents')}
        heads={[
          t('extension', 'Extension'),
          t('name', 'Name'),
          t('status', 'Status'),
          t('answered-calls', 'Answered'),
          t('abandoned-calls', 'Abandoned'),
          t('talk-time', 'Talk time'),
        ]}
        rows={live.agents.map((agent) => ({
          key: agent.extension,
          cells: [
            agent.extension,
            agent.name,
            <Badge key="status" variant={agent.pausedAt ? 'warning' : 'secondary'}>
              {agent.pausedAt ? t('agent-paused', 'Paused') : agent.status}
            </Badge>,
            format.number(agent.answered),
            format.number(agent.abandoned),
            durationText(agent.talkSeconds),
          ],
        }))}
        empty={t('no-agents', 'No agent is in this queue.')}
      />
      <TableSection
        title={t('waiting', 'Waiting')}
        heads={[t('caller', 'Caller'), t('channel', 'Channel')]}
        rows={live.waiting.map((waiting) => ({
          key: `${waiting.callerId}-${waiting.channel ?? ''}`,
          cells: [waiting.callerId, waiting.channel],
        }))}
        empty={t('no-one-waiting', 'No one is waiting.')}
      />
      <TableSection
        title={t('talking', 'Talking')}
        heads={[t('caller', 'Caller'), t('agent', 'Agent'), t('since', 'Since')]}
        rows={live.talking.map((talking) => ({
          key: `${talking.callerId}-${talking.calleeId ?? ''}`,
          cells: [
            talking.callerId,
            talking.calleeId,
            talking.since && format.dateTime(new Date(talking.since)),
          ],
        }))}
        empty={t('no-one-talking', 'No call is on the line.')}
      />
    </>
  );
};

/**
 * One queue's dashboard: today's counters as tiles, then its agents, the callers waiting and the
 * calls on the line. The PBX pushes both, and the page follows them live.
 */
export const QueuePage = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const queue = useQueue(useParams().id ?? '');
  const name = queue.data ? queue.data.name || queue.data.queue : '…';

  return (
    <PageContainer>
      <CallsHeader
        levels={[{ label: t('queues', 'Queues'), to: `${CALLS_PATH}/queues` }, { label: name }]}
      >
        <AgentStatus />
      </CallsHeader>
      {queue.isPending ? (
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4 xl:grid-cols-7">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : queue.isError ? (
        <ListError error={queue.error} />
      ) : (
        <ScrollArea>
          <div className="flex flex-col gap-4 p-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              <Tile
                title={t('total-calls', 'Total')}
                value={format.number(queue.data.totalCalls)}
              />
              <Tile
                title={t('answered-calls', 'Answered')}
                value={format.number(queue.data.answeredCalls)}
              />
              <Tile
                title={t('abandoned-calls', 'Abandoned')}
                value={format.number(queue.data.abandonedCalls)}
              />
              <Tile
                title={t('transferred-calls', 'Transferred')}
                value={format.number(queue.data.transferredCalls)}
              />
              <Tile
                title={t('average-wait', 'Average wait')}
                value={durationText(queue.data.avgWait)}
              />
              <Tile
                title={t('average-talk', 'Average talk')}
                value={durationText(queue.data.avgTalk)}
              />
              <Tile
                title={t('sla-rate', 'Service level')}
                value={`${format.number(queue.data.slaRate)}%`}
              />
            </div>
            {queue.data.live ? (
              <LiveBoard live={queue.data.live} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('no-live-board', 'The PBX has not sent the live board of this queue yet.')}
              </p>
            )}
          </div>
        </ScrollArea>
      )}
    </PageContainer>
  );
};
