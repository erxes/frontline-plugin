import {
  IconAlarm,
  IconAt,
  IconClockExclamation,
  IconInbox,
  IconUserCheck,
  IconUserOff,
} from '@tabler/icons-react';
import { Sidebar, type TConditionRule } from 'erxes-ui';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { INBOX_PATH } from '~/shared/listPath.ts';
import { NavSkeleton } from '~/shared/NavSkeleton.tsx';
import { Channels } from './ChannelNav.tsx';
import { Count, FilterLink, NavGroup, usePrefetchInbox } from './navLinks.tsx';
import { type InboxCounts as Counts, useInboxCounts, useInboxSignal } from './queries.ts';
import { useArrivalSound } from './useArrivalSound.ts';

/** The work queues, as the old inbox's sidebar had them, and the replies past their target. */
const Queues = ({ counts }: { counts: Counts }) => {
  const { t } = useTranslation('frontline');

  const queues: { name: string; icon: ComponentType; rule: TConditionRule; count: number }[] = [
    {
      name: t('assigned-to-me', 'Assigned to me'),
      icon: IconUserCheck,
      rule: { path: 'subject.assigneeId', op: 'in', value: ['me'] },
      count: counts.assignedToMe,
    },
    {
      name: t('mentions', 'Mentions'),
      icon: IconAt,
      rule: { path: 'subject.mentionedUserIds', op: 'in', value: ['me'] },
      count: counts.mentioned,
    },
    {
      name: t('unassigned', 'Unassigned'),
      icon: IconUserOff,
      rule: { path: 'subject.assigneeId', op: 'not_exists' },
      count: counts.unassigned,
    },
    {
      name: t('awaiting-response', 'Awaiting response'),
      icon: IconClockExclamation,
      rule: { path: 'subject.customerRespondedLast', op: 'eq', value: true },
      count: counts.awaitingResponse,
    },
    {
      name: t('reply-overdue', 'Reply overdue'),
      icon: IconAlarm,
      rule: { path: 'subject.replyOverdue', op: 'eq', value: true },
      count: counts.overdue,
    },
  ];

  return (
    <NavGroup id="queue" label={t('work-queue', 'Work queue')}>
      {queues.map(({ name, icon: Icon, rule, count }) => (
        <FilterLink key={name} name={name} icon={<Icon />} rule={rule} count={count} />
      ))}
    </NavGroup>
  );
};

/**
 * Inbox in Frontline's sidebar, with the count of what waits unread for the member. It sits in
 * the layout on every page, so it keeps the inbox live for all of them.
 */
export const InboxNav = () => {
  const { t } = useTranslation('frontline');
  const { pathname } = useLocation();
  const counts = useInboxCounts().data;
  const prefetch = usePrefetchInbox();

  useInboxSignal();
  useArrivalSound();

  return (
    <Sidebar.MenuItem>
      <Sidebar.MenuButton
        isActive={pathname.startsWith(INBOX_PATH)}
        render={<Link to={INBOX_PATH} {...prefetch(INBOX_PATH)} />}
      >
        <IconInbox />
        <span className="min-w-0 flex-1 truncate">{t('inbox', 'Inbox')}</span>
        <Count count={counts?.unread ?? 0} />
      </Sidebar.MenuButton>
    </Sidebar.MenuItem>
  );
};

/**
 * The groups under Inbox and Tickets: the member's channels first, their own inbox among them,
 * each a place to work inside, then the work queues across every channel. Each shows how many
 * conversations wait unread, kept live. A member who can't use the
 * inbox gets none of them, once the API refuses; until the counts come, the groups' outline shows.
 */
export const InboxGroups = () => {
  const { data: counts, isPending } = useInboxCounts();

  if (isPending) return <NavSkeleton />;

  if (!counts) return null;

  return (
    <>
      <Channels
        channels={counts.channels.filter((channel) => !channel.personal)}
        personal={counts.channels.find((channel) => channel.personal)}
      />
      <Queues counts={counts} />
    </>
  );
};
