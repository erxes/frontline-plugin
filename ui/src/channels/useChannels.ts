import type { InferClientOutputs } from '@orpc/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { orpc } from '../orpc.ts';

type Outputs = InferClientOutputs<Client>['channels'];

export type Channel = Outputs['create'];

export const useChannels = () => useQuery(orpc.channels.list.queryOptions({ input: {} }));

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

/** `?channel=<id>` opens that channel in the side panel, `?channel=new` a blank one. */
export const useOpenChannel = () => {
  const [params, setParams] = useSearchParams();

  return {
    openId: params.get('channel'),
    open: (id: string) => setParams({ channel: id }),
    close: () => setParams({}),
  };
};
