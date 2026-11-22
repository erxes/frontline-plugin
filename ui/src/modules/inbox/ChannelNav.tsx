import {
  IconCaretRightFilled,
  IconCirclePlus,
  IconCircles,
  IconDots,
  IconInbox,
  IconLayoutKanban,
  IconLink,
  IconMinus,
  IconPlus,
  IconSettings,
  IconTicket,
  IconUser,
} from '@tabler/icons-react';
import {
  Button,
  Collapsible,
  DropdownMenu,
  IconComponent,
  Sidebar,
  storedFamily,
  toast,
  useOpenRecord,
} from 'erxes-ui';
import { useMutation } from '@tanstack/react-query';
import { useAtom } from 'jotai';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { CHANNELS_PATH } from '@/channels/useChannels.ts';
import { useChoices } from '@/tickets/queries.ts';
import { orpc } from '~/orpc.ts';
import { CHANNEL_TYPE, PLUGIN } from '~/plugin.ts';
import { useChange } from '~/shared/hooks.ts';
import { channelPath } from '~/shared/channelScope.ts';
import { PIPELINE_PARAM } from '~/shared/listPath.ts';
import { Count, NavGroup, usePrefetchInbox } from './navLinks.tsx';
import type { InboxCounts } from './queries.ts';

/** Up to this many team channels all show; past it, the quiet ones fold behind one row. */
const SHOWN = 8;

/** More team channels than this get a filter box above them. */
const FILTER_FROM = 8;

type Channel = InboxCounts['channels'][number];

/**
 * Whether the member folded or unfolded each channel, remembered in the browser. Until they do,
 * the channel the page is inside starts unfolded and the others folded.
 */
const channelOpen = storedFamily({
  key: `${PLUGIN}:sidebar-channel`,
  schema: z.boolean().nullable(),
  initial: null,
});

/** The channel the open page is inside, from the address. */
const useOpenChannelId = () => /^\/frontline\/channels\/([^/]+)/.exec(useLocation().pathname)?.[1];

/** A channel's menu: its settings, and its inbox's address copied as a link. */
const ChannelActions = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();

  const copyLink = async () => {
    await navigator.clipboard.writeText(
      `${window.location.origin}${channelPath(channel.id, 'inbox')}`,
    );
    toast({ title: t('link-copied', 'Link copied') });
  };

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Sidebar.MenuAction
            showOnHover
            aria-label={t('channel-actions-of', '{{name}} actions', { name: channel.name })}
          />
        }
      >
        <IconDots />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content side="right" align="start" className="w-56">
        <DropdownMenu.Item onClick={() => void navigate(channelPath(channel.id, 'settings'))}>
          <IconSettings />
          {t('channel-settings', 'Channel settings')}
        </DropdownMenu.Item>
        <DropdownMenu.Item onClick={() => void copyLink()}>
          <IconLink />
          {t('copy-link', 'Copy link')}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

/**
 * A channel the member works in, unfolding to its pages: its inbox with what waits unread, its
 * tickets (a link per pipeline when it has several) and its settings. Inside it, every page shows
 * only its work, so the member always knows which channel they are in.
 */
export const ChannelItem = ({ channel, icon }: { channel: Channel; icon: ReactNode }) => {
  const { t } = useTranslation('frontline');
  const { pathname, search } = useLocation();
  const [toggled, setToggled] = useAtom(channelOpen(channel.id));
  const inside = useOpenChannelId() === encodeURIComponent(channel.id);
  const open = toggled ?? inside;
  const prefetch = usePrefetchInbox();
  const pipelines = useChoices().pipelines.filter((pipeline) => pipeline.channelId === channel.id);
  const picked = new URLSearchParams(search).get(PIPELINE_PARAM) ?? pipelines[0]?.id;
  const inbox = channelPath(channel.id, 'inbox');
  const tickets = channelPath(channel.id, 'tickets');
  const settings = channelPath(channel.id, 'settings');

  return (
    <Collapsible
      className="group/channel"
      open={open}
      onOpenChange={setToggled}
      render={<Sidebar.MenuItem />}
    >
      <Collapsible.Trigger render={<Sidebar.MenuButton isActive={inside && !open} />}>
        {channel.icon ? <IconComponent name={channel.icon} /> : icon}
        <span className="min-w-0 flex-1 truncate">{channel.name}</span>
        {!open && <Count count={channel.unread} beforeAction />}
        <IconCaretRightFilled className="size-3 shrink-0 text-accent-foreground transition-transform group-data-open/channel:rotate-90" />
      </Collapsible.Trigger>
      <ChannelActions channel={channel} />
      <Collapsible.Panel>
        <Sidebar.Sub>
          <Sidebar.SubItem>
            <Sidebar.SubButton
              isActive={pathname === inbox}
              render={<Link to={inbox} {...prefetch(inbox)} />}
            >
              <IconInbox />
              <span className="min-w-0 flex-1 truncate">{t('inbox', 'Inbox')}</span>
              <Count count={channel.unread} />
            </Sidebar.SubButton>
          </Sidebar.SubItem>
          {pipelines.length > 1 ? (
            pipelines.map((pipeline) => (
              <Sidebar.SubItem key={pipeline.id}>
                <Sidebar.SubButton
                  isActive={pathname === tickets && picked === pipeline.id}
                  render={<Link to={`${tickets}?${PIPELINE_PARAM}=${pipeline.id}`} />}
                >
                  <IconLayoutKanban />
                  <span className="min-w-0 truncate">{pipeline.name}</span>
                </Sidebar.SubButton>
              </Sidebar.SubItem>
            ))
          ) : (
            <Sidebar.SubItem>
              <Sidebar.SubButton isActive={pathname === tickets} render={<Link to={tickets} />}>
                <IconTicket />
                <span>{t('tickets', 'Tickets')}</span>
              </Sidebar.SubButton>
            </Sidebar.SubItem>
          )}
          <Sidebar.SubItem>
            <Sidebar.SubButton
              isActive={pathname.startsWith(settings)}
              render={<Link to={settings} />}
            >
              <IconSettings />
              <span>{t('settings', 'Settings')}</span>
            </Sidebar.SubButton>
          </Sidebar.SubItem>
        </Sidebar.Sub>
      </Collapsible.Panel>
    </Collapsible>
  );
};

/**
 * The Channels group's menu: a new channel, the member's own inbox when they have none yet, and
 * the list of every channel to manage them.
 */
const ChannelsMenu = ({ hasPersonal }: { hasPersonal: boolean }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const { openNew } = useOpenRecord();

  const personal = useMutation(
    orpc.channels.personal.mutationOptions(
      useChange(orpc.conversations.counts.key(), orpc.channels.key()),
    ),
  );

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Sidebar.GroupAction
            aria-label={t('channel-menu', 'Channel actions')}
            title={t('channel-menu', 'Channel actions')}
          />
        }
      >
        <IconPlus />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content side="right" align="start" className="w-56">
        <DropdownMenu.Item onClick={() => openNew(CHANNEL_TYPE)}>
          <IconCirclePlus />
          {t('new-channel', 'New channel')}
        </DropdownMenu.Item>
        {!hasPersonal && (
          <DropdownMenu.Item
            disabled={personal.isPending}
            onClick={() =>
              personal.mutate(undefined, {
                onSuccess: (channel) => void navigate(channelPath(channel.id, 'settings')),
              })
            }
          >
            <IconUser />
            {t('create-my-inbox', 'Create my inbox')}
          </DropdownMenu.Item>
        )}
        <DropdownMenu.Item onClick={() => void navigate(CHANNELS_PATH)}>
          <IconSettings />
          {t('manage-channels', 'Manage channels')}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

/**
 * The member's channels, their own inbox first: each unfolds to its inbox, tickets and settings.
 * Of the team channels, Those with something unread, and the open one, show first, up to
 * `SHOWN`; the rest fold behind one row. A member in many channels gets a filter box that
 * searches all of them.
 */
export const Channels = ({ channels, personal }: { channels: Channel[]; personal?: Channel }) => {
  const { t } = useTranslation('frontline');
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');
  const openId = useOpenChannelId();

  const isOpen = (channel: Channel) => openId === encodeURIComponent(channel.id);
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
    <NavGroup
      id="team"
      label={t('channels', 'Channels')}
      action={<ChannelsMenu hasPersonal={Boolean(personal)} />}
    >
      {personal && <ChannelItem channel={personal} icon={<IconUser />} />}
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
        <ChannelItem key={channel.id} channel={channel} icon={<IconCircles />} />
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
