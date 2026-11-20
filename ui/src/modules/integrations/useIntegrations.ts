import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useTranslation } from 'react-i18next';
import { useIntegrationChange } from '@/inbox/queries.ts';
import { orpc } from '~/orpc.ts';
import { useConfirmDelete } from '~/shared/Records.tsx';

type Outputs = InferClientOutputs<Client>;

export type Account = Outputs['integrations']['accounts']['list']['accounts'][number];

export type Provider = Account['provider'];

export type Bot = Outputs['integrations']['meta']['bots']['get'];

export type BotSettings = Omit<
  InferClientInputs<Client>['integrations']['meta']['bots']['update'],
  'id'
>;

export type MetaConnection = Outputs['integrations']['meta']['connections']['connections'][number];

/** A provider's accounts as members read them. */
export const useProviderNames = (): Record<Provider | MetaConnection['kind'], string> => {
  const { t } = useTranslation('frontline');

  return {
    facebook: t('facebook-page', 'Facebook page'),
    instagram: t('instagram-account', 'Instagram account'),
    telegram: t('telegram-bot', 'Telegram bot'),
    discord: t('discord-bot', 'Discord bot'),
    mail: t('mailbox', 'Mailbox'),
    call: t('grandstream-pbx', 'Grandstream PBX'),
    callpro: t('callpro-line', 'CallPro line'),
  };
};

/** The organisation's connected accounts, by provider then name. */
export const useAccounts = () =>
  useQuery(orpc.integrations.accounts.list.queryOptions({ input: {} }));

/** One connected account, read from the list the page and the side panel share. */
export const useAccount = (id: string) =>
  useQuery(
    orpc.integrations.accounts.list.queryOptions({
      input: {},
      select: (data) => data.accounts.find((account) => account.id === id),
    }),
  );

export const useMetaConnections = () =>
  useQuery(
    orpc.integrations.meta.connections.queryOptions({
      input: {},
      select: (data) => data.connections,
    }),
  );

/** The organisation's bots, by name. */
export const useBots = () =>
  useQuery(orpc.integrations.meta.bots.list.queryOptions({ select: (data) => data.bots }));

export const useBot = (id: string) =>
  useQuery(orpc.integrations.meta.bots.get.queryOptions({ input: { id } }));

/** A bot's settings as `update` takes them, from the bot as shown. */
const settingsOf = (bot: Bot): BotSettings => ({
  name: bot.name,
  persistentMenu: bot.persistentMenu,
  iceBreakers: bot.iceBreakers,
  getStartedText: bot.getStartedText,
  greeting: bot.greeting,
});

/** Saves a change to the bot's settings at Meta; a refusal leaves the bot as it was. */
export const useUpdateBot = (bot: Bot) => {
  const update = useMutation(
    orpc.integrations.meta.bots.update.mutationOptions(useIntegrationChange()),
  );

  return {
    save: (change: Partial<BotSettings>) =>
      update.mutate({ id: bot.id, ...settingsOf(bot), ...change }),
    isPending: update.isPending,
  };
};

export const META_SETTINGS = '/settings/integrations/meta';

/** Points the provider's events at frontline again, then records whether the account works. */
export const useRepairAccount = () =>
  useMutation(orpc.integrations.accounts.repair.mutationOptions(useIntegrationChange()));

/** Asks for "delete" to be typed, then disconnects the account and its bot. */
export const useRemoveAccount = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();

  const remove = useMutation(
    orpc.integrations.accounts.remove.mutationOptions(useIntegrationChange()),
  );

  return async (account: Pick<Account, 'id' | 'name'>) => {
    await confirm(t('disconnect-account-confirm', 'Disconnect {{name}}?', { name: account.name }));
    remove.mutate({ ids: [account.id] });
  };
};

/** Asks for "delete" to be typed, then removes the bot and clears its menu at Meta. */
export const useRemoveBot = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();

  const remove = useMutation(
    orpc.integrations.meta.bots.remove.mutationOptions(useIntegrationChange()),
  );

  return async (bot: Pick<Bot, 'id' | 'name'>) => {
    await confirm(t('remove-bot-confirm', 'Remove the bot {{name}}?', { name: bot.name }));
    remove.mutate({ id: bot.id });
  };
};
