import { useQuery } from '@tanstack/react-query';
import { Skeleton } from 'erxes-ui';
import { Navigate } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { channelPath } from '~/shared/channelScope.ts';

/** Opens the member's personal inbox, made by the API on the first visit, inside it. */
export const PersonalChannel = () => {
  const channel = useQuery(orpc.channels.personal.queryOptions());

  if (channel.data) return <Navigate to={channelPath(channel.data.id, 'inbox')} replace />;

  if (channel.error) return <p className="p-6 text-destructive">{channel.error.message}</p>;

  return <Skeleton className="m-6 h-8 w-56" />;
};
