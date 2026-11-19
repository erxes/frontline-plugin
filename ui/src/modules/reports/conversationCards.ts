// The overview's cards, over conversations, and the Facebook and Instagram page's.
import { cardsOf, CHART, fromReport, useConversationsData, useMetaData } from './cardKit.ts';

/** The overview's cards, over conversations. */
export const CONVERSATION_CARDS = cardsOf(
  'conversations',
  'conversations',
  ['list'],
  [
    {
      kind: 'conversations-started',
      title: ['conversations-started-title', 'Conversations started'],
      empty: ['no-conversations-in-period', 'No conversations in this period.'],
      draws: 'series',
      Body: fromReport(useConversationsData, (report, { t }) => ({
        type: 'series',
        days: report.days,
        config: { started: { label: t('conversations-started', 'Started'), color: CHART[0] } },
      })),
    },
    {
      kind: 'conversations-resolved',
      title: ['conversations-resolved-title', 'Conversations resolved'],
      empty: ['no-conversations-in-period', 'No conversations in this period.'],
      draws: 'series',
      Body: fromReport(useConversationsData, (report, { t }) => ({
        type: 'series',
        days: report.days,
        config: { resolved: { label: t('conversations-resolved', 'Resolved'), color: CHART[1] } },
      })),
    },
    {
      kind: 'conversations-by-source',
      title: ['conversations-by-source', 'Conversations by source'],
      empty: ['no-conversations-in-period', 'No conversations in this period.'],
      draws: 'rows',
      Body: fromReport(useConversationsData, (report, { kinds }) => ({
        type: 'rows',
        rows: report.sources.map(({ kind, count }) => {
          const name = kinds[kind] ?? kind;

          return { key: kind, label: name, name, value: count };
        }),
      })),
    },
    {
      kind: 'conversations-by-tag',
      title: ['conversations-by-tag', 'Conversations by tag'],
      empty: ['no-tagged-conversations', 'No tagged conversations in this period.'],
      draws: 'rows',
      Body: fromReport(useConversationsData, (report) => ({
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
      kind: 'conversation-responders',
      title: ['top-responders', 'Top responders'],
      empty: ['no-replies-in-period', 'No member replied in this period.'],
      draws: 'table',
      Body: fromReport(useConversationsData, (report, { t }) => ({
        type: 'table',
        heads: [
          t('member', 'Member'),
          t('replies', 'Replies'),
          t('conversations', 'Conversations'),
        ],
        rows: report.members.map((row) => ({
          key: row.userId,
          cells: [{ member: row.userId }, row.replies, row.conversations],
        })),
      })),
    },
    {
      kind: 'conversation-list',
      title: ['conversation-list', 'Conversations'],
      empty: ['no-conversations-in-period', 'No conversations in this period.'],
      draws: 'list',
    },
  ],
);

/** The Facebook and Instagram page's cards, over their conversations. */
export const META_CARDS = cardsOf(
  'meta',
  'conversations',
  ['series', 'list'],
  [
    {
      kind: 'meta-over-time',
      title: ['meta-over-time', 'Facebook and Instagram over time'],
      empty: ['no-meta-activity', 'No Facebook or Instagram activity in this period.'],
      draws: 'series',
      Body: fromReport(useMetaData, (report, { t }) => ({
        type: 'series',
        days: report.days,
        config: {
          conversations: {
            label: t('meta-conversations', 'Direct conversations'),
            color: CHART[0],
          },
          messages: { label: t('meta-messages', 'Messages'), color: CHART[1] },
          comments: { label: t('meta-comments', 'Comments'), color: CHART[2] },
        },
      })),
    },
    {
      kind: 'meta-messages-by-sender',
      title: ['meta-messages-by-sender', 'Messages by sender'],
      empty: ['no-meta-activity', 'No Facebook or Instagram activity in this period.'],
      draws: 'rows',
      Body: fromReport(useMetaData, (report, { t }) => {
        const rows = [
          { key: 'incoming', name: t('meta-from-customers', 'Customers'), value: report.incoming },
          { key: 'staff', name: t('meta-from-members', 'Members'), value: report.staff },
          { key: 'bot', name: t('meta-from-bot', 'Bot'), value: report.bot },
        ];

        return {
          type: 'rows',
          rows: rows.some((row) => row.value > 0)
            ? rows.map((row) => ({ ...row, label: row.name }))
            : [],
        };
      }),
    },
    {
      kind: 'meta-engagement',
      title: ['meta-engagement', 'Conversations and comments'],
      empty: ['no-meta-activity', 'No Facebook or Instagram activity in this period.'],
      draws: 'table',
      Body: fromReport(useMetaData, (report, { t }) => ({
        type: 'table',
        heads: [t('meta-measure', 'Measure'), t('count', 'Count')],
        rows: [
          ['conversations', t('meta-conversations', 'Direct conversations'), report.conversations],
          ['bot', t('meta-bot-conversations', 'With the bot'), report.botConversations],
          ['comments', t('meta-comments', 'Comments'), report.comments],
          ['posts', t('meta-posts', 'Posts commented on'), report.posts],
        ].map(([key, name, value]) => ({ key: String(key), cells: [String(name), Number(value)] })),
      })),
    },
    {
      kind: 'meta-posts',
      title: ['meta-top-posts', 'Posts with the most comments'],
      empty: ['no-meta-comments', 'No comments under posts in this period.'],
      draws: 'table',
      Body: fromReport(useMetaData, (report, { t, date }) => ({
        type: 'table',
        heads: [
          t('meta-post', 'Post'),
          t('meta-comments', 'Comments'),
          t('replies', 'Replies'),
          t('meta-commenters', 'Commenters'),
          t('last-activity', 'Last activity'),
        ],
        rows: report.topPosts.map((post) => ({
          key: post.postId,
          cells: [
            { postId: post.postId, conversationId: post.conversationId },
            post.comments,
            post.replies,
            post.commenters,
            date(post.lastActivityAt),
          ],
        })),
      })),
    },
    {
      kind: 'meta-list',
      title: ['meta-list', 'Facebook and Instagram conversations'],
      empty: ['no-meta-activity', 'No Facebook or Instagram activity in this period.'],
      draws: 'list',
    },
  ],
);
