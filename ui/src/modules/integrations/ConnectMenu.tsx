import { IconChevronDown, IconMessageCircle, IconPlugConnected } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, DropdownMenu, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useIntegrationChange } from '@/inbox/queries.ts';
import { orpc } from '~/orpc.ts';
import { ACCOUNT_TYPE, INTEGRATION_TYPE } from '~/plugin.ts';
import { KindIcon } from '~/shared/kinds.tsx';
import { integrationsQuery } from '~/shared/reference.ts';
import { FORM_PROVIDERS } from './AccountNew.tsx';
import { useAccounts, useProviderNames } from './useIntegrations.ts';

/**
 * The connected accounts that serve no channel yet, and adding one as an integration of
 * `channelId`. An account serves one channel, so one active in another stays out.
 */
export const useOutsideAccounts = (channelId: string) => {
  const accounts = useAccounts().data?.accounts ?? [];

  const joined = new Set(
    (useQuery(integrationsQuery).data ?? [])
      .filter((integration) => integration.isActive || integration.channelId === channelId)
      .map((integration) => integration.config.accountId),
  );

  const add = useMutation(orpc.integrations.create.mutationOptions(useIntegrationChange()));

  return { outside: accounts.filter((account) => !joined.has(account.id)), add };
};

/**
 * The connected accounts that serve no channel yet, each a menu item adding it to `channelId`,
 * under a heading after the menu's other items when `heading`. Nothing when there are none.
 */
const AccountItems = ({ channelId, heading = false }: { channelId: string; heading?: boolean }) => {
  const { t } = useTranslation('frontline');
  const { outside, add } = useOutsideAccounts(channelId);

  if (outside.length === 0) return null;

  const items = outside.map((account) => (
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
  ));

  if (!heading) return items;

  return (
    <>
      <DropdownMenu.Separator />
      <DropdownMenu.Label>{t('add-connected', 'Add a connected account')}</DropdownMenu.Label>
      {items}
    </>
  );
};

/**
 * Connect: Facebook and Instagram through one of the organisation's Facebook connections, every
 * other provider with its form, in core's side panel. Opened from a channel, what it connects joins that channel, and the accounts
 * connected before are offered to add. `withMessenger` makes it Add integration, a website
 * messenger first.
 */
export const ConnectMenu = ({
  channelId,
  withMessenger = false,
}: {
  channelId?: string;
  withMessenger?: boolean;
}) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const names = useProviderNames();

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button variant={channelId ? 'ghost' : 'default'} size={channelId ? 'sm' : 'default'}>
            <IconPlugConnected />
            {withMessenger ? t('add-integration', 'Add integration') : t('connect', 'Connect')}
            <IconChevronDown />
          </Button>
        }
      />
      <DropdownMenu.Content align="end">
        {withMessenger && (
          <>
            <DropdownMenu.Item onClick={() => openNew(INTEGRATION_TYPE, { channelId })}>
              <IconMessageCircle />
              {t('website-messenger', 'Website messenger')}
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
          </>
        )}
        <DropdownMenu.Item onClick={() => openNew(ACCOUNT_TYPE, { provider: 'meta', channelId })}>
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
        {channelId && <AccountItems heading channelId={channelId} />}
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
