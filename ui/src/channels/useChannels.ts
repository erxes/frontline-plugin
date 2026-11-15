import type { InferClientOutputs } from '@orpc/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { toast } from 'erxes-ui';
import { useQueryState } from 'nuqs';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { orpc } from '../orpc.ts';

type Outputs = InferClientOutputs<Client>['channels'];

export type Channel = Outputs['create'];

export type ChannelMember = Outputs['get']['members'][number];

/** Where the channel pages live, as the old plugin had them. */
export const CHANNELS_PATH = '/frontline/settings/channels';

/** The query string key the list's search filter writes. */
export const SEARCH_KEY = 'searchValue';

/** The channels the member sees, by name, narrowed by the list's search filter. */
export const useChannels = () => {
  const [search] = useQueryState(SEARCH_KEY);

  return {
    search,
    ...useQuery(orpc.channels.list.queryOptions({ input: { name: search || undefined } })),
  };
};

/** The channel with its members. */
export const useChannel = (id: string) =>
  useQuery(orpc.channels.get.queryOptions({ input: { id } }));

/**
 * What every channel change does when it settles: refetch the channel queries
 * on success, show the API's refusal as a toast on failure.
 */
export const useChannelChange = () => {
  const { t } = useTranslation('frontline');
  const queryClient = useQueryClient();

  return {
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orpc.channels.key() }),
    onError: (error: Error) =>
      toast({
        variant: 'destructive',
        title: t('change-failed', 'Could not save the change'),
        description: error.message,
      }),
  };
};

/** A channel role as members read it. */
export const useRoleNames = () => {
  const { t } = useTranslation('frontline');

  return { admin: t('role-admin', 'Admin'), member: t('role-member', 'Member') };
};

/**
 * The side panel: `?channel=new` creates a channel, `?channel=<id>` edits one,
 * `?channel-members=<id>` adds members to one.
 */
export const usePanel = () => {
  const [params, setParams] = useSearchParams();

  const set = (key: string, value: string) =>
    setParams((current) => {
      current.set(key, value);

      return current;
    });

  return {
    channelId: params.get('channel'),
    membersOf: params.get('channel-members'),
    openChannel: (id: string) => set('channel', id),
    addMembers: (id: string) => set('channel-members', id),
    close: () =>
      setParams((current) => {
        current.delete('channel');
        current.delete('channel-members');

        return current;
      }),
  };
};
