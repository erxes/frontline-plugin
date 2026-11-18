import {
  IconAlertTriangle,
  IconCalendarCheck,
  IconCircles,
  IconDots,
  IconExternalLink,
  IconHeartbeat,
  IconKey,
  IconLink,
  IconListNumbers,
  IconPlugConnected,
  IconRefresh,
  IconServer,
  IconTrash,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  buttonVariants,
  PanelSection,
  Skeleton,
  Spinner,
  type TRecordSlotProps,
  useFormat,
  useOpenRecord,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { INTEGRATION_TYPE } from '~/plugin.ts';
import { InfoRow } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { StatusBadge } from './parts.tsx';
import { PbxSettings } from './PbxSettings.tsx';
import {
  type Account,
  useAccount,
  useRepairAccount,
  useProviderNames,
  useRemoveAccount,
} from './useIntegrations.ts';

/** The panel header's title: the account's name. */
export const AccountTitle = ({ contentId }: TRecordSlotProps) => {
  const account = useAccount(contentId);

  if (account.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{account.data?.name ?? account.error?.message}</span>;
};

/** The header's menu: add the account to a channel, repair it, or disconnect it. */
export const AccountActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const account = useAccount(contentId).data;
  const repair = useRepairAccount();
  const remove = useRemoveAccount();

  if (!account) return null;

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('account-menu', 'Account actions')}>
          <IconDots />
        </Button>
      }
      actions={[
        {
          value: 'channel',
          icon: <IconCircles />,
          label: t('add-to-channel', 'Add to a channel'),
          onSelect: () =>
            openNew(INTEGRATION_TYPE, {
              kind: account.provider,
              accountId: account.id,
              name: account.name,
            }),
        },
        {
          value: 'repair',
          icon: <IconRefresh />,
          label: t('repair', 'Repair'),
          onSelect: () => repair.mutate({ id: account.id }),
        },
        {
          value: 'remove',
          icon: <IconTrash />,
          label: t('disconnect', 'Disconnect'),
          onSelect: () => void remove(account),
        },
      ]}
    />
  );
};

/**
 * What the bot does in a server: read and send in its channels and threads, and manage messages.
 * Discord's permission bits 10, 11, 13, 16, 34 and 38, as the old plugin asked for them.
 */
const DISCORD_PERMISSIONS = String(2 ** 10 + 2 ** 11 + 2 ** 13 + 2 ** 16 + 2 ** 34 + 2 ** 38);

/** Discord's page that adds the bot to a server, whose id is its application's. */
const DiscordInvite = ({ account }: { account: Account }) => {
  const { t } = useTranslation('frontline');
  const url = new URL('https://discord.com/oauth2/authorize');

  url.searchParams.set('client_id', account.externalId);
  url.searchParams.set('permissions', DISCORD_PERMISSIONS);
  url.searchParams.set('scope', 'bot');

  return (
    <PanelSection title={t('servers', 'Servers')}>
      <InfoRow icon={IconServer} label={t('invite', 'Invite')}>
        <a
          href={url.toString()}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          <IconExternalLink />
          {t('discord-add-bot-to-server', 'Add this bot to a server')}
        </a>
      </InfoRow>
    </PanelSection>
  );
};

/** What Telegram last said about delivering the bot's updates here. */
const TelegramWebhook = ({ account }: { account: Account }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  const webhook = useQuery(
    orpc.integrations.telegram.webhookInfo.queryOptions({ input: { id: account.id } }),
  ).data;

  if (!webhook) return null;

  return (
    <PanelSection title={t('webhook', 'Webhook')}>
      <InfoRow icon={IconLink} label={t('address', 'Address')}>
        <span className="truncate">{webhook.url}</span>
      </InfoRow>
      <InfoRow icon={IconListNumbers} label={t('waiting-updates', 'Waiting updates')}>
        {webhook.pendingUpdateCount}
      </InfoRow>
      {webhook.lastErrorMessage && (
        <InfoRow icon={IconAlertTriangle} label={t('last-error', 'Last error')}>
          {webhook.lastErrorAt && format.dateTime(webhook.lastErrorAt)} {webhook.lastErrorMessage}
        </InfoRow>
      )}
    </PanelSection>
  );
};

/**
 * A phone account's webhook, where its bridge posts calls, and for a Grandstream PBX its settings,
 * the queues frontline follows and the members who answer it by extension.
 */
const PhoneSettings = ({ account }: { account: Account }) => {
  const { t } = useTranslation('frontline');

  const settings = useQuery(
    orpc.integrations.call.settings.queryOptions({ input: { accountId: account.id } }),
  ).data;

  if (!settings) return <Spinner area="lg" />;

  return (
    <>
      <PanelSection title={t('webhook', 'Webhook')}>
        <InfoRow icon={IconLink} label={t('address', 'Address')}>
          <span className="truncate">{settings.webhookUrl}</span>
        </InfoRow>
        {settings.webhookSecret && (
          <InfoRow icon={IconKey} label={t('secret', 'Secret')}>
            <span className="truncate font-mono">{settings.webhookSecret}</span>
          </InfoRow>
        )}
      </PanelSection>
      {account.provider === 'call' && <PbxSettings account={account} settings={settings} />}
    </>
  );
};

/** The Detail tab: the account's provider and health, then what its provider adds. */
export const AccountDetail = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const names = useProviderNames();
  const account = useAccount(contentId);

  if (account.isPending) return <Spinner area="lg" />;

  if (!account.data)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {account.error?.message ?? t('no-such-account', 'No such account')}
      </p>
    );

  const { data } = account;

  return (
    <div key={data.id}>
      <PanelSection title={t('account', 'Account')}>
        <InfoRow icon={IconPlugConnected} label={t('type', 'Type')}>
          {names[data.provider]}
        </InfoRow>
        <InfoRow icon={IconHeartbeat} label={t('status', 'Status')}>
          <StatusBadge status={data.status} />
          {data.error}
        </InfoRow>
        <InfoRow icon={IconCalendarCheck} label={t('checked-at', 'Checked at')}>
          {data.checkedAt ? format.dateTime(data.checkedAt) : t('never', 'Never')}
        </InfoRow>
      </PanelSection>
      {data.provider === 'telegram' && <TelegramWebhook account={data} />}
      {data.provider === 'discord' && <DiscordInvite account={data} />}
      {(data.provider === 'call' || data.provider === 'callpro') && (
        <PhoneSettings account={data} />
      )}
    </div>
  );
};
