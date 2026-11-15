import type { InferClientOutputs } from '@orpc/client';
import { useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { useChange, useParamPanel, useSearch } from '~/shared/hooks.ts';

type Outputs = InferClientOutputs<Client>['channels'];

export type Channel = Outputs['create'];

export type ChannelMember = Outputs['get']['members'][number];

/** Where the channel pages live, as the old plugin had them. */
export const CHANNELS_PATH = '/frontline/settings/channels';

/** The channels the member sees, by name, narrowed by the list's search filter. */
export const useChannels = () => {
  const search = useSearch();

  return {
    search,
    ...useQuery(orpc.channels.list.queryOptions({ input: { name: search || undefined } })),
  };
};

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

/**
 * The side panels: `?channel=new` creates a channel, `?channel=<id>` edits one,
 * `?channel-members=<id>` adds members to one.
 */
export const usePanel = () => {
  const channel = useParamPanel('channel');
  const members = useParamPanel('channel-members');

  return {
    channelId: channel.value,
    membersOf: members.value,
    openChannel: channel.open,
    addMembers: members.open,
    closeChannel: channel.close,
    closeMembers: members.close,
  };
};
