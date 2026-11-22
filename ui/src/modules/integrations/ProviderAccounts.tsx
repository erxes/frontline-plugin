import { IconPlugConnected } from '@tabler/icons-react';
import { Button, useOpenRecord } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ACCOUNT_TYPE } from '~/plugin.ts';
import { AccountsList } from './AccountsList.tsx';
import { useCanConnect } from './ConnectMenu.tsx';
import { type Provider, useConnectMeta, useMetaApp } from './useIntegrations.ts';

/** An integration's Accounts tab: its Connect button for members who may, then its accounts. */
const ProviderAccounts = ({
  providers,
  connect,
}: {
  providers: Provider[];
  connect: ReactNode;
}) => (
  <div className="flex flex-col">
    {useCanConnect() && <div className="flex justify-end px-3 pt-3">{connect}</div>}
    <AccountsList providers={providers} />
  </div>
);

/** Connect for a provider whose form opens in the side panel: a bot's token, a mailbox, a PBX. */
const FormConnect = ({ provider }: { provider: Provider }) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();

  return (
    <Button onClick={() => openNew(ACCOUNT_TYPE, { provider })}>
      <IconPlugConnected />
      {t('connect', 'Connect')}
    </Button>
  );
};

/** Connect through Meta's login, once the App tab holds a Meta app. */
const MetaConnect = () => {
  const { t } = useTranslation('frontline');
  const meta = useConnectMeta();
  const app = useMetaApp();

  return (
    <Button
      disabled={!app || meta.isPending}
      title={
        app === false ? t('meta-app-first', 'Set the Meta app in the App tab first') : undefined
      }
      onClick={() => meta.mutate({})}
    >
      <IconPlugConnected />
      {t('connect-pages', 'Connect pages')}
    </Button>
  );
};

/** Facebook and Instagram's Accounts tab: the pages and accounts Meta's login connected. */
export const MetaAccounts = () => (
  <ProviderAccounts providers={['facebook', 'instagram']} connect={<MetaConnect />} />
);

/** The Telegram bots connected. */
export const TelegramAccounts = () => (
  <ProviderAccounts providers={['telegram']} connect={<FormConnect provider="telegram" />} />
);

/** The Discord bots connected. */
export const DiscordAccounts = () => (
  <ProviderAccounts providers={['discord']} connect={<FormConnect provider="discord" />} />
);

/** The mailboxes connected. */
export const MailAccounts = () => (
  <ProviderAccounts providers={['mail']} connect={<FormConnect provider="mail" />} />
);

/** The Grandstream PBXs connected. */
export const CallAccounts = () => (
  <ProviderAccounts providers={['call']} connect={<FormConnect provider="call" />} />
);

/** The CallPro lines connected. */
export const CallProAccounts = () => (
  <ProviderAccounts providers={['callpro']} connect={<FormConnect provider="callpro" />} />
);
