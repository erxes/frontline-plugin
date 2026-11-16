import {
  IconAt,
  IconCircles,
  IconClockExclamation,
  IconInbox,
  IconMinus,
  IconPlus,
  IconUser,
  IconUserCheck,
  IconUserOff,
} from '@tabler/icons-react';
import {
  Badge,
  Button,
  Collapsible,
  IconComponent,
  listFilterQuery,
  Sidebar,
  storedFamily,
  type TConditionGroup,
  type TConditionRule,
  useFormat,
} from 'erxes-ui';
import { useAtom } from 'jotai';
import { createSerializer, useQueryStates } from 'nuqs';
import { type ComponentType, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { z } from 'zod';
import { PLUGIN } from '~/plugin.ts';
import { useInboxCounts } from './queries.ts';

const INBOX = `/${PLUGIN}/inbox`;

/** Team channels shown before the rest fold behind one row. */
const SHOWN = 8;

/** More team channels than this get a filter box above them. */
const FILTER_FROM = 8;

const inboxLink = createSerializer(listFilterQuery);

/** Whether each sidebar group is open, remembered in the browser as the old sidebar did. */
const groupOpen = storedFamily({
  key: `${PLUGIN}:inbox-group`,
  schema: z.boolean(),
  initial: true,
});

/** The inbox narrowed to the channel `id`. */
const channelRule = (id: string): TConditionRule => ({
  path: 'subject.channelId',
  op: 'in',
  value: [id],
});

/** The inbox filtered by one rule, as the filter bar keeps it in the address. */
const filterOf = (rule: TConditionRule): TConditionGroup => ({ match: 'all', rules: [rule] });

/** The inbox filter in the address, to compare a link's rule with. */
const useOpenFilter = () => {
  const [{ advanced }] = useQueryStates(listFilterQuery);

  return JSON.stringify(advanced);
};

const Count = ({ count }: { count: number }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  if (!count) return null;

  return (
    <Badge
      variant="secondary"
      className="ml-auto"
      aria-label={t('unread-count', '{{count}} unread', { count })}
    >
      {format.number(count)}
    </Badge>
  );
};

/**
 * One queue or channel: a link that sets the inbox's filter to its rule, or clears it when that
 * filter is on already, with its unread count.
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
  const open = useOpenFilter();
  const filter = filterOf(rule);
  const active = pathname === INBOX && open === JSON.stringify(filter);

  return (
    <Sidebar.MenuItem>
      <Sidebar.MenuButton
        isActive={active}
        render={<Link to={active ? INBOX : inboxLink(INBOX, { advanced: filter })} />}
      >
        {icon}
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <Count count={count} />
      </Sidebar.MenuButton>
    </Sidebar.MenuItem>
  );
};

/** A sidebar group whose label folds it, as the old Work queue, My inbox and Team inbox did. */
const NavGroup = ({ id, label, children }: { id: string; label: string; children: ReactNode }) => {
  const [open, setOpen] = useAtom(groupOpen(id));

  return (
    <Collapsible open={open} onOpenChange={setOpen} render={<Sidebar.Group variant="compact" />}>
      <Collapsible.Trigger nativeButton={false} render={<Sidebar.GroupLabel />}>
        <Collapsible.TriggerIcon />
        {label}
      </Collapsible.Trigger>
      <Collapsible.Panel>
        <Sidebar.GroupContent>
          <Sidebar.Menu aria-label={label}>{children}</Sidebar.Menu>
        </Sidebar.GroupContent>
      </Collapsible.Panel>
    </Collapsible>
  );
};

type Counts = NonNullable<ReturnType<typeof useInboxCounts>>;

type Channel = Counts['channels'][number];

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

const ChannelLink = ({ channel, icon }: { channel: Channel; icon: ReactNode }) => (
  <FilterLink
    name={channel.name}
    icon={channel.icon ? <IconComponent name={channel.icon} /> : icon}
    rule={channelRule(channel.id)}
    count={channel.unread}
  />
);

/**
 * The member's team channels. Those with something unread, and the open one, show first, up to
 * `SHOWN`; the rest fold behind one row. A member in many channels gets a filter box that
 * searches all of them.
 */
const TeamChannels = ({ channels }: { channels: Channel[] }) => {
  const { t } = useTranslation('frontline');
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const open = useOpenFilter();

  if (channels.length === 0) return null;

  const isOpen = (channel: Channel) => open === JSON.stringify(filterOf(channelRule(channel.id)));
  const query = search.trim().toLowerCase();
  const busy = channels.filter((channel) => channel.unread > 0 || isOpen(channel));
  const first = (busy.length > 0 ? busy : channels).slice(0, SHOWN);
  const opened = channels.find(isOpen);

  // The open channel always shows, even past the first `SHOWN`.
  const folded =
    opened && !first.includes(opened)
      ? channels.filter((channel) => first.includes(channel) || channel === opened)
      : first;

  const shown = query
    ? channels.filter((channel) => channel.name.toLowerCase().includes(query))
    : expanded
      ? channels
      : folded;

  const hidden = channels.length - folded.length;
  const hiddenQuiet = channels.every((channel) => folded.includes(channel) || !channel.unread);

  return (
    <NavGroup id="team" label={t('team-inbox', 'Team inbox')}>
      {channels.length > FILTER_FROM && (
        <Sidebar.MenuItem>
          <Sidebar.Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('filter-channels', 'Filter channels')}
            aria-label={t('filter-channels', 'Filter channels')}
          />
        </Sidebar.MenuItem>
      )}
      {shown.map((channel) => (
        <ChannelLink key={channel.id} channel={channel} icon={<IconCircles />} />
      ))}
      {query && shown.length === 0 && (
        <Sidebar.MenuItem>
          <span className="block px-2 py-1 text-xs text-muted-foreground">
            {t('no-channels-match', 'No channel matches')}
          </span>
        </Sidebar.MenuItem>
      )}
      {!query && hidden > 0 && (
        <Sidebar.MenuItem>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? <IconMinus /> : <IconPlus />}
            {expanded
              ? t('show-fewer-channels', 'Show fewer channels')
              : hiddenQuiet
                ? t('quiet-channels', {
                    defaultValue_one: '{{count}} quiet channel',
                    defaultValue_other: '{{count}} quiet channels',
                    count: hidden,
                  })
                : t('more-channels', {
                    defaultValue_one: '{{count}} more channel',
                    defaultValue_other: '{{count}} more channels',
                    count: hidden,
                  })}
          </Button>
        </Sidebar.MenuItem>
      )}
    </NavGroup>
  );
};

/** Inbox in Frontline's sidebar, with the count of what waits unread for the member. */
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
    </Sidebar.MenuItem>
  );
};

/**
 * The old inbox's groups under Frontline's pages: the work queues, My inbox (the member's
 * personal inbox) and Team inbox (their team channels). Each link sets the inbox's filter in the
 * address and shows how many conversations wait unread, kept live. A member who can't use the
 * inbox gets none of them.
 */
export const InboxGroups = () => {
  const { t } = useTranslation('frontline');
  const counts = useInboxCounts();

  if (!counts) return null;

  const personal = counts.channels.filter((channel) => channel.personal);

  return (
    <>
      <Queues counts={counts} />
      {personal.length > 0 && (
        <NavGroup id="mine" label={t('my-inbox', 'My inbox')}>
          {personal.map((channel) => (
            <ChannelLink key={channel.id} channel={channel} icon={<IconUser />} />
          ))}
        </NavGroup>
      )}
      <TeamChannels channels={counts.channels.filter((channel) => !channel.personal)} />
    </>
  );
};
