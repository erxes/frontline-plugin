import { type Icon, IconCircles } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { AppBreadcrumb, type Crumb, IconComponent, PageHeader } from 'erxes-ui';
import type { ReactNode } from 'react';
import { channelPath, useChannelScope } from './channelScope.ts';
import { channelsQuery } from './reference.ts';

/** The icon of the channel the page is inside, as the member picked it. */
const ScopedChannelIcon = () => {
  const channelId = useChannelScope();
  const channel = useQuery(channelsQuery).data?.channels.find((one) => one.id === channelId);

  return channel?.icon ? <IconComponent name={channel.icon} /> : <IconCircles />;
};

/** The crumb of the channel the page is inside, leading to its inbox; none across channels. */
const useChannelCrumb = (): Crumb[] => {
  const channelId = useChannelScope();
  const channels = useQuery(channelsQuery).data?.channels ?? [];

  if (!channelId) return [];

  const name = channels.find((channel) => channel.id === channelId)?.name ?? '…';

  return [{ label: name, to: channelPath(channelId, 'inbox'), icon: ScopedChannelIcon }];
};

/**
 * A page's header: erxes-ui's `AppBreadcrumb` with the app's icon and name (`app`) first, then
 * each level, the last one the page. Inside a channel the channel leads, so the member always
 * sees whose work they are in. `children` is the page's one primary action.
 */
export const AppHeader = ({
  icon,
  app,
  levels = [],
  children,
}: {
  icon: Icon;
  app: Crumb;
  levels?: Crumb[];
  children?: ReactNode;
}) => {
  const channel = useChannelCrumb();

  return (
    <PageHeader>
      <PageHeader.Start>
        <AppBreadcrumb items={[...channel, { ...app, icon }, ...levels]} />
      </PageHeader.Start>
      {children && <PageHeader.End>{children}</PageHeader.End>}
    </PageHeader>
  );
};
