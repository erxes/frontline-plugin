import { useFormat } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { DayChart } from './Charts.tsx';
import { useMetaReport } from './queries.ts';
import { shareOf, Stat, Stats, Tile } from './Tile.tsx';

type MetaReport = NonNullable<ReturnType<typeof useMetaReport>['query']['data']>;

/**
 * The pages' and accounts' direct conversations, who wrote their messages and the bot's share,
 * and the comments under posts, as the old Facebook report's cards had them.
 */
export const MetaStats = ({ report }: { report: MetaReport }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const messages = report.incoming + report.staff + report.bot;

  return (
    <Stats>
      <Stat
        label={t('meta-conversations', 'Direct conversations')}
        value={format.number(report.conversations)}
        hint={t('meta-bot-coverage', '{{share}} with the bot', {
          share: shareOf(report.botConversations, report.conversations),
        })}
      />
      <Stat
        label={t('meta-messages', 'Messages')}
        value={format.number(messages)}
        hint={t('meta-message-split', '{{incoming}} in, {{staff}} from members', {
          incoming: format.number(report.incoming),
          staff: format.number(report.staff),
        })}
      />
      <Stat
        label={t('meta-bot-messages', 'Bot messages')}
        value={format.number(report.bot)}
        hint={t('meta-share-of-messages', '{{share}} of messages', {
          share: shareOf(report.bot, messages),
        })}
      />
      <Stat label={t('meta-comments', 'Comments')} value={format.number(report.comments)} />
      <Stat label={t('meta-posts', 'Posts commented on')} value={format.number(report.posts)} />
    </Stats>
  );
};

/** The numbers of `MetaStats` for the tile's period and channel. */
export const MetaSummary = () => {
  const { period, pick, query } = useMetaReport('meta-summary');

  return (
    <Tile period={period} pick={pick} query={query}>
      {(report) => <MetaStats report={report} />}
    </Tile>
  );
};

/** Direct conversations started, messages and comments each day. */
export const MetaOverTime = () => {
  const { t } = useTranslation('frontline');
  const { period, pick, query } = useMetaReport('meta-over-time');

  return (
    <Tile period={period} pick={pick} query={query}>
      {(report) => (
        <DayChart
          days={report.days}
          config={{
            conversations: {
              label: t('meta-conversations', 'Direct conversations'),
              color: 'var(--chart-1)',
            },
            messages: { label: t('meta-messages', 'Messages'), color: 'var(--chart-2)' },
            comments: { label: t('meta-comments', 'Comments'), color: 'var(--chart-3)' },
          }}
          empty={t('no-meta-activity', 'No Facebook or Instagram activity in this period.')}
        />
      )}
    </Tile>
  );
};
