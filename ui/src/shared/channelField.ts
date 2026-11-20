import { IconCircles } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { TListFilterField } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { channelsQuery } from './reference.ts';

/** Whether the member works in two or more channels, so telling them apart means something. */
export const useManyChannels = () => (useQuery(channelsQuery).data?.channels.length ?? 0) > 1;

/**
 * The channel field of a list's filter, on `subject.channelId`. A member in one channel gets
 * none: every row is in that channel.
 */
export const useChannelField = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');
  const channels = useQuery(channelsQuery).data?.channels ?? [];

  if (channels.length < 2) return [];

  return [
    {
      path: 'subject.channelId',
      label: t('channel', 'Channel'),
      type: 'select',
      icon: IconCircles,
      options: channels.map((channel) => ({ value: channel.id, label: channel.name })),
    },
  ];
};
