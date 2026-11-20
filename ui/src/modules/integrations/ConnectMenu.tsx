import { IconChevronDown, IconPlugConnected } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, DropdownMenu, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useIntegrationChange } from '@/inbox/queries.ts';
import { orpc } from '~/orpc.ts';
import { ACCOUNT_TYPE } from '~/plugin.ts';
import { KindIcon } from '~/shared/kinds.tsx';
import { integrationsQuery } from '~/shared/reference.ts';
import { FORM_PROVIDERS } from './AccountNew.tsx';
import {
  META_SETTINGS,
  useAccounts,
  useConnectMeta,
  useMetaApp,
  useMetaConnections,
  useProviderNames,
} from './useIntegrations.ts';

/**
 * The connected accounts that serve no channel yet; adding one makes it an integration of
 * `channelId`. An account serves one channel, so one active in another stays out.
 */
const AccountItems = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const accounts = useAccounts().data?.accounts ?? [];
  const connections = useMetaConnections().data ?? [];

  const joined = new Set(
    (useQuery(integrationsQuery).data ?? [])
      .filter((integration) => integration.isActive || integration.channelId === channelId)
      .map((integration) => integration.config.accountId ?? integration.config.connectionId),
  );

  const add = useMutation(orpc.integrations.create.mutationOptions(useIntegrationChange()));

  const outside = [
    ...connections.map((connection) => ({
      id: connection.id,
      kind: connection.kind,
      name: connection.name,
      config: { connectionId: connection.id },
    })),
    ...accounts.map((account) => ({
      id: account.id,
      kind: account.provider,
      name: account.name,
      config: { accountId: account.id },
    })),
  ].filter((item) => !joined.has(item.id));

  if (!outside.length) return null;

  return (
    <>
      <DropdownMenu.Separator />
      <DropdownMenu.Label>{t('add-connected', 'Add a connected account')}</DropdownMenu.Label>
      {outside.map(({ id, kind, name, config }) => (
        <DropdownMenu.Item
          key={id}
          disabled={add.isPending}
          onClick={() => add.mutate({ channelId, kind, name, config })}
        >
          <KindIcon kind={kind} />
          {name}
        </DropdownMenu.Item>
      ))}
    </>
  );
};

/**
 * Facebook and Instagram, which connect through Meta's login. With no Meta app, the
 * organisation's own or the install's, the item says so and opens the settings that set one.
 */
const MetaItem = () => {
  const { t } = useTranslation('frontline');
  const meta = useConnectMeta();
  const app = useMetaApp();

  const name = (
    <>
      <KindIcon kind="facebook" />
      {t('facebook-and-instagram', 'Facebook and Instagram')}
    </>
  );

  if (app === false)
    return (
      <DropdownMenu.Item render={<Link to={META_SETTINGS} />}>
        {name}
        <span className="text-xs text-muted-foreground">
          {t('meta-app-missing', 'Set up a Meta app in Settings first')}
        </span>
      </DropdownMenu.Item>
    );

  // Off until the check answers, so a quick click never starts a login that has no app.
  return (
    <DropdownMenu.Item disabled={app === undefined || meta.isPending} onClick={() => meta.mutate()}>
      {name}
    </DropdownMenu.Item>
  );
};

/**
 * Connect: Facebook and Instagram through Meta's login, every other provider with its form in
 * core's side panel. Opened from a channel, what it connects joins that channel, and the accounts
 * and pages connected before are offered to add.
 */
export const ConnectMenu = ({ channelId }: { channelId?: string }) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
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
        <MetaItem />
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
