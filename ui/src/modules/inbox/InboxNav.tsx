import {
  IconAt,
  IconCircles,
  IconClockExclamation,
  IconInbox,
  IconMinus,
  IconPlus,
  IconUserCheck,
  IconUserOff,
} from '@tabler/icons-react';
import {
  Badge,
  Button,
  IconComponent,
  listFilterQuery,
  Sidebar,
  type TConditionGroup,
  type TConditionRule,
} from 'erxes-ui';
import { createSerializer, useQueryStates } from 'nuqs';
import { type ComponentType, type ReactNode, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { PLUGIN } from '~/plugin.ts';
import { useInboxCounts } from './queries.ts';

const INBOX = `/${PLUGIN}/inbox`;

const inboxLink = createSerializer(listFilterQuery);

/** The inbox narrowed to the channel `id`. */
const channelRule = (id: string): TConditionRule => ({
  path: 'subject.channelId',
  op: 'in',
  value: [id],
});

/** The inbox filtered by one rule, as the filter bar keeps it in the address. */
const filterOf = (rule: TConditionRule): TConditionGroup => ({ match: 'all', rules: [rule] });

const Count = ({ count }: { count: number }) => {
  const { t } = useTranslation('frontline');

  if (!count) return null;

  return (
    <Badge
      variant="secondary"
      className="ml-auto"
      aria-label={t('unread-count', '{{count}} unread', { count })}
    >
      {count}
    </Badge>
  );
};

/**
 * One queue or channel under Inbox: a link that sets the inbox's filter to its rule, or clears it
 * when that filter is on already, with its unread count.
 */
const FilterLink = ({
  name,
  icon,
  rule,
  count,
}: {
  name: string;
  icon: ReactNode;
  rule: TConditionRule;
  count: number;
}) => {
  const { pathname } = useLocation();
  const [{ advanced }] = useQueryStates(listFilterQuery);
  const filter = filterOf(rule);
  const active = pathname === INBOX && JSON.stringify(advanced) === JSON.stringify(filter);

  return (
    <Sidebar.SubItem>
      <Sidebar.SubButton
        isActive={active}
        render={<Link to={active ? INBOX : inboxLink(INBOX, { advanced: filter })} />}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <Count count={count} />
      </Sidebar.SubButton>
    </Sidebar.SubItem>
  );
};

type Counts = NonNullable<ReturnType<typeof useInboxCounts>>;

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
    <Sidebar.Sub aria-label={t('work-queue', 'Work queue')}>
      {queues.map(({ name, icon: Icon, rule, count }) => (
        <FilterLink key={name} name={name} icon={<Icon />} rule={rule} count={count} />
      ))}
    </Sidebar.Sub>
  );
};

/**
 * The member's channels, each filtering the inbox to it. Channels with nothing unread fold behind
 * one row while another channel waits, as the old team inbox did.
 */
const Channels = ({ counts }: { counts: Counts }) => {
  const { t } = useTranslation('frontline');
  const [showQuiet, setShowQuiet] = useState(false);
  const [{ advanced }] = useQueryStates(listFilterQuery);
  const labelId = useId();

  const open = JSON.stringify(advanced);

  const busy = counts.channels.filter(
    (channel) => channel.unread > 0 || open === JSON.stringify(filterOf(channelRule(channel.id))),
  );

  const quiet = counts.channels.length - busy.length;
  const fold = busy.length > 0 && quiet > 0;
  const shown = fold && !showQuiet ? busy : counts.channels;

  if (counts.channels.length === 0) return null;

  return (
    <>
      <span id={labelId} className="block px-4 pt-2 text-xs font-medium text-muted-foreground">
        {t('channels', 'Channels')}
      </span>
      <Sidebar.Sub aria-labelledby={labelId}>
        {shown.map((channel) => (
          <FilterLink
            key={channel.id}
            name={channel.name}
            icon={channel.icon ? <IconComponent name={channel.icon} /> : <IconCircles />}
            rule={channelRule(channel.id)}
            count={channel.unread}
          />
        ))}
        {fold && (
          <Sidebar.SubItem>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={() => setShowQuiet((value) => !value)}
            >
              {showQuiet ? <IconMinus /> : <IconPlus />}
              {showQuiet
                ? t('hide-quiet-channels', 'Hide quiet channels')
                : t('quiet-channels', '{{count}} quiet channels', { count: quiet })}
            </Button>
          </Sidebar.SubItem>
        )}
      </Sidebar.Sub>
    </>
  );
};

/**
 * Inbox in Frontline's sidebar, with its work queues and the member's channels under it. Each
 * sets the inbox's filter in the address and shows how many conversations wait unread, kept live.
 * A member who can't use the inbox gets the link alone.
 */
export const InboxNav = () => {
  const { t } = useTranslation('frontline');
  const { pathname } = useLocation();
  const counts = useInboxCounts();

  return (
    <Sidebar.MenuItem>
      <Sidebar.MenuButton isActive={pathname.startsWith(INBOX)} render={<Link to={INBOX} />}>
        <IconInbox />
        <span className="min-w-0 flex-1 truncate">{t('inbox', 'Inbox')}</span>
        <Count count={counts?.unread ?? 0} />
      </Sidebar.MenuButton>
      {counts && (
        <>
          <Queues counts={counts} />
          <Channels counts={counts} />
        </>
      )}
    </Sidebar.MenuItem>
  );
};
