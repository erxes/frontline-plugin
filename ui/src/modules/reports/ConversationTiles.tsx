import { useFormat } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { MemberLine } from '~/shared/Person.tsx';
import { useKindNames } from '~/shared/kinds.tsx';
import { DayChart } from './Charts.tsx';
import { conversationLinks } from './conversationLinks.ts';
import { useConversationReport } from './queries.ts';
import { BarList, MiniTable, Stat, Stats, Tile, useSpanText } from './Tile.tsx';

/** Started, resolved and open conversations, and how fast members answered and resolved them. */
export const ConversationSummary = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const span = useSpanText();
  const { period, pick, query } = useConversationReport('conversation-summary');
  const links = conversationLinks(period.range, pick.id);

  return (
    <Tile period={period} pick={pick} query={query}>
      {(report) => (
        <Stats>
          <Stat
            label={t('conversations-started', 'Started')}
            value={format.number(report.started)}
            to={links.started()}
          />
          <Stat
            label={t('conversations-resolved', 'Resolved')}
            value={format.number(report.resolved)}
            to={links.resolved()}
          />
          <Stat
            label={t('conversations-unresolved', 'Unresolved now')}
            value={format.number(report.unresolved)}
            to={links.unresolved()}
          />
          <Stat
            label={t('average-first-response', 'Average first response')}
            value={span(report.firstResponseSeconds)}
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

/** Conversations started and resolved each day. */
export const ConversationsOverTime = () => {
  const { t } = useTranslation('frontline');
  const { period, pick, query } = useConversationReport('conversations-over-time');

  return (
    <Tile period={period} pick={pick} query={query}>
      {(report) => (
        <DayChart
          days={report.days}
          config={{
            started: { label: t('conversations-started', 'Started'), color: 'var(--chart-1)' },
            resolved: { label: t('conversations-resolved', 'Resolved'), color: 'var(--chart-2)' },
          }}
          empty={t('no-conversations-in-period', 'No conversations in this period.')}
        />
      )}
    </Tile>
  );
};

/** The period's conversations by the integration they came through. */
export const ConversationsBySource = () => {
  const { t } = useTranslation('frontline');
  const kinds = useKindNames();
  const { period, pick, query } = useConversationReport('conversations-by-source');
  const links = conversationLinks(period.range, pick.id);

  return (
    <Tile period={period} pick={pick} query={query}>
      {(report) => (
        <BarList
          rows={report.sources.map(({ kind, count }) => {
            const name = kinds[kind] ?? kind;

            return {
              key: kind,
              label: name,
              name,
              value: count,
              to: links.started({ path: 'subject.kind', op: 'in', value: [kind] }),
            };
          })}
          empty={t('no-conversations-in-period', 'No conversations in this period.')}
        />
      )}
    </Tile>
  );
};

/** The tags on the period's conversations, the most used first. */
export const ConversationsByTag = () => {
  const { t } = useTranslation('frontline');
  const { period, pick, query } = useConversationReport('conversations-by-tag');
  const links = conversationLinks(period.range, pick.id);

  return (
    <Tile period={period} pick={pick} query={query}>
      {(report) => (
        <BarList
          rows={report.tags.map((tag) => ({
            key: tag.tagId,
            label: tag.name,
            name: tag.name,
            value: tag.count,
            color: tag.colorCode,
            to: links.started({ path: 'subject.tagIds', op: 'in', value: [tag.tagId] }),
          }))}
          empty={t('no-tagged-conversations', 'No tagged conversations in this period.')}
        />
      )}
    </Tile>
  );
};

/** The members who replied to customers the most, and in how many conversations. */
export const ConversationResponders = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const { period, pick, query } = useConversationReport('conversation-responders');

  return (
    <Tile period={period} pick={pick} query={query}>
      {(report) => (
        <MiniTable
          heads={[
            t('member', 'Member'),
            t('replies', 'Replies'),
            t('conversations', 'Conversations'),
          ]}
          rows={report.members.map((row) => ({
            key: row.userId,
            lead: <MemberLine id={row.userId} />,
            numbers: [format.number(row.replies), format.number(row.conversations)],
          }))}
          empty={t('no-replies-in-period', 'No member replied in this period.')}
        />
      )}
    </Tile>
  );
};
