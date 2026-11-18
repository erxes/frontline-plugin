import { IconCircles } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { AppHeader } from '~/shared/Header.tsx';
import { CHANNELS_PATH } from './useChannels.ts';

/**
 * The header of the channel settings pages, as core's breadcrumb draws it: Channels, then the
 * open channel, then the page of it (`label`). `children` is the page's one primary action.
 */
export const ChannelsHeader = ({
  channelId,
  label,
  children,
}: {
  channelId?: string;
  label?: string;
  children?: ReactNode;
}) => {
  const { t } = useTranslation('frontline');

  const { data } = useQuery({
    ...orpc.channels.get.queryOptions({ input: { id: channelId ?? '' } }),
    enabled: Boolean(channelId),
  });

  const levels = [
    ...(channelId ? [{ label: data?.name ?? '…', to: `${CHANNELS_PATH}/${channelId}` }] : []),
    ...(label ? [{ label }] : []),
  ];

  return (
    <AppHeader
      icon={IconCircles}
      app={{ label: t('channels', 'Channels'), to: CHANNELS_PATH }}
      levels={levels}
    >
      {children}
    </AppHeader>
  );
};
