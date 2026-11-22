import { IconCircles } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import type { TListFilterField } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useChannelScope } from './channelScope.ts';
import { channelsQuery } from './reference.ts';

/**
 * Whether rows can come from two or more channels, so telling them apart means something: the
 * member works in several, and the page isn't inside one of them.
 */
export const useManyChannels = () => {
  const count = useQuery(channelsQuery).data?.channels.length ?? 0;

  return useChannelScope() === null && count > 1;
};

/**
 * The channel field of a list's filter, on `subject.channelId`. A member in one channel, or a
 * page inside one, gets none: every row is in that channel.
 */
export const useChannelField = (): TListFilterField[] => {
  const { t } = useTranslation('frontline');
  const channels = useQuery(channelsQuery).data?.channels ?? [];

  if (!useManyChannels()) return [];

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
