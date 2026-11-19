import type { TConditionRule } from 'erxes-ui';
import { between, channelRule, INBOX_PATH, listPath } from '~/shared/listPath.ts';
import type { Conversation } from '@/inbox/queries.ts';

/** Every status a conversation takes; a status added to the API fails the build here. */
const STATUSES = { new: true, open: true, resolved: true } satisfies Record<
  Conversation['status'],
  true
>;

/** The inbox leaves resolved conversations out unless its filter names a status. */
const ANY_STATUS: TConditionRule = {
  path: 'subject.status',
  op: 'in',
  value: Object.keys(STATUSES),
};

/**
 * Where a conversation tile's numbers lead: the inbox narrowed to what the number counts, by
 * whole days, and to the channel the tile picked.
 */
export const conversationLinks = (range: { from: Date; to: Date }, channelId: string | null) => {
  const inChannel = channelId ? [channelRule(channelId)] : [];

  return {
    /** The period's new conversations, narrowed further by `rules`. */
    started: (...rules: TConditionRule[]) =>
      listPath(
        INBOX_PATH,
        ANY_STATUS,
        ...inChannel,
        ...between('subject.createdAt', range),
        ...rules,
      ),
    resolved: () =>
      listPath(INBOX_PATH, ANY_STATUS, ...inChannel, ...between('subject.resolvedAt', range)),
    /** The inbox as it opens: every conversation not resolved. */
    unresolved: () => (channelId ? listPath(INBOX_PATH, channelRule(channelId)) : INBOX_PATH),
  };
};
