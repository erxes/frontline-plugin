import {
  IconChevronRight,
  IconCircles,
  IconMinus,
  IconPlus,
  IconSettings,
} from '@tabler/icons-react';
import { Button, cn, IconComponent, Sidebar, storedFamily, type TConditionRule } from 'erxes-ui';
import { useAtom } from 'jotai';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { CHANNELS_PATH } from '@/channels/useChannels.ts';
import { z } from 'zod';
import { PLUGIN } from '~/plugin.ts';
import { KindIcon, useKindNames } from '~/shared/kinds.tsx';
import { channelRule } from '~/shared/listPath.ts';
import {
  Count,
  FilterLink,
  filterOf,
  NavGroup,
  useFilterLink,
  useOpenFilter,
  usePrefetchInbox,
} from './navLinks.tsx';
import type { InboxCounts } from './queries.ts';

/** Up to this many team channels all show; past it, the quiet ones fold behind one row. */
const SHOWN = 8;

/** More team channels than this get a filter box above them. */
const FILTER_FROM = 8;

type Channel = InboxCounts['channels'][number];

/** The inbox narrowed to one kind of integration, such as `messenger`. */
const kindRule = (kind: string): TConditionRule => ({
  path: 'subject.kind',
  op: 'in',
  value: [kind],
});

/** One kind of integration under its open channel, narrowing the inbox to both. */
const KindLink = ({
  channelId,
  kind,
  count,
}: {
  channelId: string;
  kind: string;
  count: number;
}) => {
  const kinds = useKindNames();
  const { active, to } = useFilterLink(channelRule(channelId), kindRule(kind));
  const prefetch = usePrefetchInbox();

  return (
    <Sidebar.SubItem>
      <Sidebar.SubButton isActive={active} render={<Link to={to} {...prefetch(to)} />}>
        <KindIcon kind={kind} />
        <span className="min-w-0 flex-1 truncate">{kinds[kind] ?? kind}</span>
        <Count count={count} />
      </Sidebar.SubButton>
    </Sidebar.SubItem>
  );
};

/**
 * Whether the member opened or closed a channel's kinds with its chevron, remembered in the
 * browser. Until they do, the kinds show while the inbox shows the channel.
 */
const kindsOpen = storedFamily({
  key: `${PLUGIN}:inbox-channel-kinds`,
  schema: z.boolean().nullable(),
  initial: null,
});

/**
 * A channel, and under it the kinds of integration in it, each with its unread, as the old
 * sidebar opened a channel into Messenger, Facebook, Email and the rest. Its chevron opens or
 * closes them; a channel the member hasn't toggled shows them while the inbox shows it.
 */
export const ChannelLink = ({ channel, icon }: { channel: Channel; icon: ReactNode }) => {
  const { t } = useTranslation('frontline');
  const open = useOpenFilter();
  const [toggled, setToggled] = useAtom(kindsOpen(channel.id));
  const channelOpen = open.includes(JSON.stringify(channelRule(channel.id)));
  const hasKinds = channel.kinds.length > 1;
  const shown = hasKinds && (toggled ?? channelOpen);

  return (
    <FilterLink
      name={channel.name}
      icon={channel.icon ? <IconComponent name={channel.icon} /> : icon}
      rule={channelRule(channel.id)}
      count={channel.unread}
      action={
        hasKinds && (
          <Sidebar.MenuAction
            aria-label={t('channel-kinds', '{{name}} integrations', { name: channel.name })}
            aria-expanded={shown}
            onClick={() => setToggled(!shown)}
          >
            <IconChevronRight className={cn('transition-transform', shown && 'rotate-90')} />
          </Sidebar.MenuAction>
        )
      }
    >
      {shown && (
        <Sidebar.Sub>
          {channel.kinds.map(({ kind, unread }) => (
            <KindLink key={kind} channelId={channel.id} kind={kind} count={unread} />
          ))}
        </Sidebar.Sub>
      )}
    </FilterLink>
  );
};

/** The Channels group's gear: the channel settings, where channels are made and set up. */
const ManageChannels = () => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();

  return (
    <Sidebar.GroupAction
      aria-label={t('manage-channels', 'Manage channels')}
      title={t('manage-channels', 'Manage channels')}
      onClick={() => void navigate(CHANNELS_PATH)}
    >
      <IconSettings />
    </Sidebar.GroupAction>
  );
};

/**
 * The member's team channels. Those with something unread, and the open one, show first, up to
 * `SHOWN`; the rest fold behind one row. A member in many channels gets a filter box that
 * searches all of them.
 */
export const TeamChannels = ({ channels }: { channels: Channel[] }) => {
  const { t } = useTranslation('frontline');
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const open = useOpenFilter();

  if (channels.length === 0) return null;

  const isOpen = (channel: Channel) => open === JSON.stringify(filterOf(channelRule(channel.id)));
  const query = search.trim().toLowerCase();
  const busy = channels.filter((channel) => channel.unread > 0 || isOpen(channel));

  const first =
    channels.length <= SHOWN ? channels : (busy.length > 0 ? busy : channels).slice(0, SHOWN);

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
    <NavGroup id="team" label={t('channels', 'Channels')} action={<ManageChannels />}>
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
