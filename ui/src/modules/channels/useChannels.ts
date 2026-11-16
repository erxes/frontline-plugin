import type { InferClientOutputs } from '@orpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useListFilterParams } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { useChange } from '~/shared/hooks.ts';
import { useConfirmDelete } from '~/shared/Records.tsx';

type Outputs = InferClientOutputs<Client>['channels'];

export type Channel = Outputs['create'];

export type ChannelMember = Outputs['members'][number];

/** Where the channel pages live, as the old plugin had them. */
export const CHANNELS_PATH = '/frontline/settings/channels';

/** The channels the member sees, by name, narrowed by the filter bar. */
export const useChannels = () =>
  useQuery(orpc.channels.list.queryOptions({ input: useListFilterParams() }));

/** The channel with its members. */
export const useChannel = (id: string) =>
  useQuery(orpc.channels.get.queryOptions({ input: { id } }));

/** Refetches the channel queries after a change, and shows a refusal. */
export const useChannelChange = () => useChange(orpc.channels.key());

/** A channel role as members read it. */
export const useRoleNames = () => {
  const { t } = useTranslation('frontline');

  return { admin: t('role-admin', 'Admin'), member: t('role-member', 'Member') };
};

/** Asks for "delete" to be typed, then deletes the channels: all of them, or none when the API refuses one. */
export const useDeleteChannels = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const remove = useMutation(orpc.channels.remove.mutationOptions(useChannelChange()));

  const deleteChannels = async (ids: string[], done?: () => void) => {
    await confirm(
      t('delete-channels-confirm', {
        defaultValue_one: 'Delete this channel?',
        defaultValue_other: 'Delete {{count}} channels?',
        count: ids.length,
      }),
    );
    remove.mutate({ ids }, { onSuccess: done });
  };

  return { deleteChannels, isPending: remove.isPending };
};
