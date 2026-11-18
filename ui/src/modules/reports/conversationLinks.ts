import type { TConditionRule } from 'erxes-ui';
import { INBOX } from '@/inbox/navLinks.tsx';
import { useStatusNames } from '@/inbox/InboxFilter.tsx';
import { between, listPath } from '~/shared/listPath.ts';
import type { useConversationReport } from './queries.ts';

/**
 * Where a conversation tile's numbers lead: the inbox narrowed to what the number counts, by
 * whole days. The inbox leaves resolved conversations out unless its filter names a status, so a
 * period's conversations name them all.
 */
export const useConversationLinks = ({ period }: ReturnType<typeof useConversationReport>) => {
  const anyStatus: TConditionRule = {
    path: 'subject.status',
    op: 'in',
    value: Object.keys(useStatusNames()),
  };

  return {
    /** The period's new conversations, narrowed further by `rules`. */
    started: (...rules: TConditionRule[]) =>
      listPath(INBOX, anyStatus, ...between('subject.createdAt', period.range), ...rules),
    resolved: () => listPath(INBOX, anyStatus, ...between('subject.resolvedAt', period.range)),
    /** The inbox as it opens: every conversation not resolved. */
    unresolved: () => INBOX,
  };
};
