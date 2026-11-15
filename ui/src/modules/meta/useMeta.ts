import type { InferClientInputs, InferClientOutputs } from '@orpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { useChange } from '~/shared/hooks.ts';
import { useConfirmDelete } from '~/shared/Records.tsx';

type Outputs = InferClientOutputs<Client>;

export type Account = Outputs['integrations']['accounts']['list']['accounts'][number];

export type Bot = Outputs['integrations']['meta']['bots']['get'];

export type BotSettings = Omit<
  InferClientInputs<Client>['integrations']['meta']['bots']['update'],
  'id'
>;

const isMeta = (account: Account) =>
  account.provider === 'facebook' || account.provider === 'instagram';

/** The connected Facebook pages and Instagram accounts, by provider then name. */
export const useMetaAccounts = () =>
  useQuery(
    orpc.integrations.accounts.list.queryOptions({
      input: {},
      select: (data) => data.accounts.filter(isMeta),
    }),
  );

/** The organisation's bots, by name. */
export const useBots = () =>
  useQuery(orpc.integrations.meta.bots.list.queryOptions({ select: (data) => data.bots }));

export const useBot = (id: string) =>
  useQuery(orpc.integrations.meta.bots.get.queryOptions({ input: { id } }));

/** Refetches accounts and bots after a change, and shows a refusal. */
export const useIntegrationChange = () => useChange(orpc.integrations.key());

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

/** Sends the member to Meta's login, where they pick the pages to connect. */
export const useConnect = () => {
  const { onError } = useIntegrationChange();

  return useMutation(
    orpc.integrations.meta.loginUrl.mutationOptions({
      onSuccess: ({ url }) => window.location.assign(url),
      onError,
    }),
  );
};

/** Asks for "delete" to be typed, then disconnects the account and its bot. */
export const useRemoveAccount = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();

  const remove = useMutation(
    orpc.integrations.accounts.remove.mutationOptions(useIntegrationChange()),
  );

  return async (account: Account) => {
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
