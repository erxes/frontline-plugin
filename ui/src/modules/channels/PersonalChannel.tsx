import { useQuery } from '@tanstack/react-query';
import { Skeleton } from 'erxes-ui';
import { Navigate } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { CHANNELS_PATH } from './useChannels.ts';

/** Opens the member's personal inbox, which the API makes on the first visit. */
export const PersonalChannel = () => {
  const channel = useQuery(orpc.channels.personal.queryOptions());

  if (channel.data)
    return <Navigate to={`${CHANNELS_PATH}/${encodeURIComponent(channel.data.id)}`} replace />;

  if (channel.error) return <p className="p-6 text-destructive">{channel.error.message}</p>;

  return <Skeleton className="m-6 h-8 w-56" />;
};
