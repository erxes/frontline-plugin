import { IconChevronDown, IconPlugConnected } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, DropdownMenu, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useIntegrationChange } from '@/inbox/queries.ts';
import { orpc } from '~/orpc.ts';
import { ACCOUNT_TYPE } from '~/plugin.ts';
import { KindIcon } from '~/shared/kinds.tsx';
import { integrationsQuery } from '~/shared/reference.ts';
import { FORM_PROVIDERS } from './AccountNew.tsx';
import { useAccounts, useConnectMeta, useProviderNames } from './useIntegrations.ts';

/**
 * The connected accounts that serve no channel yet; adding one makes it an integration of
 * `channelId`. An account serves one channel, so one active in another stays out.
 */
const AccountItems = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const accounts = useAccounts().data?.accounts ?? [];

  const joined = new Set(
    (useQuery(integrationsQuery).data ?? [])
      .filter((integration) => integration.isActive || integration.channelId === channelId)
      .map((integration) => integration.config.accountId),
  );

  const add = useMutation(orpc.integrations.create.mutationOptions(useIntegrationChange()));
  const outside = accounts.filter((account) => !joined.has(account.id));

  if (!outside.length) return null;

  return (
    <>
      <DropdownMenu.Separator />
      <DropdownMenu.Label>{t('add-connected', 'Add a connected account')}</DropdownMenu.Label>
      {outside.map((account) => (
        <DropdownMenu.Item
          key={account.id}
          disabled={add.isPending}
          onClick={() =>
            add.mutate({
              channelId,
              kind: account.provider,
              name: account.name,
              config: { accountId: account.id },
            })
          }
        >
          <KindIcon kind={account.provider} />
          {account.name}
        </DropdownMenu.Item>
      ))}
    </>
  );
};

/**
 * Connect: Facebook and Instagram through Meta's login, every other provider with its form in
 * core's side panel. Opened from a channel, what it connects joins that channel, and the accounts
 * connected before are offered to add.
 */
export const ConnectMenu = ({ channelId }: { channelId?: string }) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const meta = useConnectMeta();
  const names = useProviderNames();

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button variant={channelId ? 'ghost' : 'default'} size={channelId ? 'sm' : 'default'}>
            <IconPlugConnected />
            {t('connect', 'Connect')}
            <IconChevronDown />
          </Button>
        }
      />
      <DropdownMenu.Content align="end">
        <DropdownMenu.Item disabled={meta.isPending} onClick={() => meta.mutate({ channelId })}>
          <KindIcon kind="facebook" />
          {t('facebook-and-instagram', 'Facebook and Instagram')}
        </DropdownMenu.Item>
        {FORM_PROVIDERS.map((provider) => (
          <DropdownMenu.Item
            key={provider}
            onClick={() => openNew(ACCOUNT_TYPE, { provider, channelId })}
          >
            <KindIcon kind={provider} />
            {names[provider]}
          </DropdownMenu.Item>
        ))}
        {channelId && <AccountItems channelId={channelId} />}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
};

/** Whether the member may connect accounts: core's integration manage permission. */
export const useCanConnect = () =>
  useQuery(
    orpc.integrations.accounts.list.queryOptions({
      input: {},
      select: (data) => data.canManage,
    }),
  ).data ?? false;
