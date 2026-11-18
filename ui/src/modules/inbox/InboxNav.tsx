import {
  IconAt,
  IconClockExclamation,
  IconInbox,
  IconPlus,
  IconUser,
  IconUserCheck,
  IconUserOff,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Sidebar, type TConditionRule } from 'erxes-ui';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { useChange } from '~/shared/hooks.ts';
import { INBOX_PATH } from '~/shared/listPath.ts';
import { NavSkeleton } from '~/shared/NavSkeleton.tsx';
import { CHANNELS_PATH } from '@/channels/useChannels.ts';
import { ChannelLink, TeamChannels } from './ChannelNav.tsx';
import { Count, FilterLink, NavGroup } from './navLinks.tsx';
import { type InboxCounts as Counts, useInboxCounts, useInboxSignal } from './queries.ts';
import { useArrivalSound } from './useArrivalSound.ts';

/** The work queues, as the old inbox's sidebar had them. */
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
 * Makes the member's personal inbox, as the old sidebar's Personal channel did, then opens it in
 * its channel page to add the pages, bots and mailboxes that come into it.
 */
const CreatePersonal = () => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();

  const create = useMutation(
    orpc.channels.personal.mutationOptions(
      useChange(orpc.conversations.counts.key(), orpc.channels.key()),
    ),
  );

  return (
    <Sidebar.MenuItem>
      <Sidebar.MenuButton
        disabled={create.isPending}
        onClick={() =>
          create.mutate(undefined, {
            onSuccess: (channel) =>
              void navigate(`${CHANNELS_PATH}/${encodeURIComponent(channel.id)}`),
          })
        }
      >
        <IconPlus />
        <span>{t('create-my-inbox', 'Create my inbox')}</span>
      </Sidebar.MenuButton>
    </Sidebar.MenuItem>
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

  useInboxSignal();
  useArrivalSound();

  return (
    <Sidebar.MenuItem>
      <Sidebar.MenuButton
        isActive={pathname.startsWith(INBOX_PATH)}
        render={<Link to={INBOX_PATH} />}
      >
        <IconInbox />
        <span className="min-w-0 flex-1 truncate">{t('inbox', 'Inbox')}</span>
        <Count count={counts?.unread ?? 0} />
      </Sidebar.MenuButton>
    </Sidebar.MenuItem>
  );
};

/**
 * The old inbox's groups under Frontline's pages: the work queues, My inbox (the member's
 * personal inbox) and Team inbox (their team channels). Each link sets the inbox's filter in the
 * address and shows how many conversations wait unread, kept live. A member who can't use the
 * inbox gets none of them, once the API refuses; until the counts come, the groups' outline shows.
 */
export const InboxGroups = () => {
  const { t } = useTranslation('frontline');
  const { data: counts, isPending } = useInboxCounts();

  if (isPending) return <NavSkeleton />;

  if (!counts) return null;

  const personal = counts.channels.filter((channel) => channel.personal);

  return (
    <>
      <Queues counts={counts} />
      <NavGroup id="mine" label={t('my-inbox', 'My inbox')}>
        {personal.map((channel) => (
          <ChannelLink key={channel.id} channel={channel} icon={<IconUser />} />
        ))}
        {personal.length === 0 && <CreatePersonal />}
      </NavGroup>
      <TeamChannels channels={counts.channels.filter((channel) => !channel.personal)} />
    </>
  );
};
