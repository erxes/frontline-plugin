import {
  type Icon,
  IconPlugConnected,
  IconCircles,
  IconClockHour4,
  IconGitBranch,
  IconMessageReply,
  IconUsers,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { cn, IconComponent, ScrollArea } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { CHANNEL_KINDS, useKindTitles } from '@/integrations/kindText.ts';
import { channelSettingsPath } from '~/shared/channelScope.ts';
import { KindIcon } from '~/shared/kinds.tsx';
import { integrationsQuery } from '~/shared/reference.ts';
import { NavGroup, NavRow } from '~/shared/RecordWorkspace.tsx';
import type { Channel } from './useChannels.ts';

/** The channel's own sections, its integrations first, each with how many it holds. */
const useSections = (
  channel: Channel,
): { section: string; label: string; icon: Icon; count?: number }[] => {
  const { t } = useTranslation('frontline');

  const integrations = (useQuery(integrationsQuery).data ?? []).filter(
    (integration) => integration.channelId === channel.id,
  ).length;

  return [
    {
      section: 'integrations',
      label: t('integrations', 'Integrations'),
      icon: IconPlugConnected,
      count: integrations,
    },
    { section: 'replies', label: t('replies', 'Replies'), icon: IconClockHour4 },
    {
      section: 'members',
      label: t('members', 'Members'),
      icon: IconUsers,
      count: channel.memberIds.length,
    },
    {
      section: 'pipelines',
      label: t('pipelines', 'Pipelines'),
      icon: IconGitBranch,
      count: channel.pipelineCount,
    },
    {
      section: 'templates',
      label: t('response-templates', 'Response templates'),
      icon: IconMessageReply,
      count: channel.templateCount,
    },
  ];
};

/** How many of each kind bring the channel conversations, and the kinds it uses and doesn't. */
const useChannelKinds = (channelId: string) => {
  const ours = (useQuery(integrationsQuery).data ?? []).filter(
    (integration) => integration.channelId === channelId,
  );

  const countOf = (kind: string) => ours.filter((integration) => integration.kind === kind).length;

  return {
    countOf,
    connected: CHANNEL_KINDS.filter((kind) => countOf(kind) > 0),
    available: CHANNEL_KINDS.filter((kind) => countOf(kind) === 0),
  };
};

/** The kinds bringing the channel conversations, with how many, then the rest it could add. */
const KindGroups = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const titles = useKindTitles();
  const { countOf, connected, available } = useChannelKinds(channelId);
  const kindPath = (kind: string) => channelSettingsPath(channelId, `integrations/${kind}`);

  return (
    <>
      {connected.length > 0 && (
        <NavGroup label={t('in-this-channel', 'In this channel')}>
          {connected.map((kind) => (
            <NavRow
              key={kind}
              to={kindPath(kind)}
              mark={<KindIcon kind={kind} className="size-4" />}
              label={titles[kind] ?? kind}
              count={countOf(kind)}
            />
          ))}
        </NavGroup>
      )}
      {available.length > 0 && (
        <NavGroup label={t('available', 'Available')}>
          {available.map((kind) => (
            <NavRow
              key={kind}
              muted
              to={kindPath(kind)}
              mark={<KindIcon kind={kind} className="size-4" />}
              label={titles[kind] ?? kind}
            />
          ))}
        </NavGroup>
      )}
    </>
  );
};

/** The column's foot: how many kinds of integration the channel uses, of all it could. */
const KindsConnected = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const { connected } = useChannelKinds(channelId);

  return (
    <p className="flex items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
      <span
        className={cn('size-2 rounded-full', connected.length > 0 ? 'bg-success' : 'bg-border')}
      />
      {t('kinds-connected', '{{count}} of {{total}} connected', {
        count: connected.length,
        total: CHANNEL_KINDS.length,
      })}
    </p>
  );
};

/** The channel at the column's top: its icon on a tile, its name and description, opening General. */
const ChannelHead = ({ channel }: { channel: Channel }) => {
  const { pathname } = useLocation();
  const to = channelSettingsPath(channel.id, 'general');
  const current = pathname === to;

  return (
    <Link
      to={to}
      aria-current={current ? 'page' : undefined}
      className={cn(
        'flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-accent',
        current && 'bg-primary/10 hover:bg-primary/10',
      )}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-background">
        {channel.icon ? <IconComponent name={channel.icon} /> : <IconCircles />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-sm font-semibold">{channel.name}</span>
        <span className="line-clamp-2 text-xs text-muted-foreground">
          {channel.description || channel.name}
        </span>
      </span>
    </Link>
  );
};

/**
 * A channel's settings column, as old erxes laid it out: the channel itself, opening its general
 * settings; its reply rules; its members, pipelines and response templates with how many; then each kind of
 * integration, those bringing it conversations first with how many, then the rest it could add,
 * and how many of them it uses.
 */
export const ChannelSettingsNav = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const sections = useSections(channel);

  return (
    <aside
      aria-label={t('channel-sections', 'Channel settings')}
      className="flex max-h-56 shrink-0 flex-col border-b md:max-h-none md:w-72 md:border-r md:border-b-0"
    >
      <ScrollArea className="min-h-0 flex-1">
        <nav
          aria-label={t('channel-sections', 'Channel settings')}
          className="flex flex-col gap-5 p-3"
        >
          <ChannelHead channel={channel} />
          <ul className="flex flex-col gap-0.5">
            {sections.map(({ section, label, icon: SectionIcon, count }) => (
              <NavRow
                key={section}
                to={channelSettingsPath(channel.id, section)}
                mark={<SectionIcon className="size-4" />}
                label={label}
                count={count}
              />
            ))}
          </ul>
          <KindGroups channelId={channel.id} />
        </nav>
      </ScrollArea>
      <KindsConnected channelId={channel.id} />
    </aside>
  );
};
