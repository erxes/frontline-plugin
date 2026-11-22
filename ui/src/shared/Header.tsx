import { type Icon, IconCircles } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { AppBreadcrumb, type Crumb, IconComponent, PageHeader } from 'erxes-ui';
import type { ReactNode } from 'react';
import { channelPath, useChannelScope } from './channelScope.ts';
import { orpc } from '~/orpc.ts';

/**
 * The channel the page is inside, read on its own: the member's personal inbox is one too, though
 * the list of channels leaves it out.
 */
const useScopedChannel = () => {
  const channelId = useChannelScope();

  return useQuery({
    ...orpc.channels.get.queryOptions({ input: { id: channelId ?? '' } }),
    enabled: Boolean(channelId),
  }).data;
};

/** The icon of the channel the page is inside, as the member picked it. */
const ScopedChannelIcon = () => {
  const icon = useScopedChannel()?.icon;

  return icon ? <IconComponent name={icon} /> : <IconCircles />;
};

/** The crumb of the channel the page is inside, leading to its inbox; none across channels. */
const useChannelCrumb = (): Crumb[] => {
  const channelId = useChannelScope();
  const name = useScopedChannel()?.name ?? '…';

  if (!channelId) return [];

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
