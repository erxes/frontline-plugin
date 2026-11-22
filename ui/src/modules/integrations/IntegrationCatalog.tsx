import { IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, buttonVariants, useOpenRecord } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ACCOUNT_TYPE, INTEGRATION_TYPE } from '~/plugin.ts';
import { KindIcon } from '~/shared/kinds.tsx';
import { integrationsQuery } from '~/shared/reference.ts';
import { FORM_PROVIDERS } from './AccountNew.tsx';
import { useCanConnect } from './ConnectMenu.tsx';
import { META_SETTINGS, useConnectMeta, useMetaApp } from './useIntegrations.ts';

/** Each kind's card title: short, as the hint under it says what it brings. */
const useKindTitles = (): Record<string, string> => {
  const { t } = useTranslation('frontline');

  return {
    messenger: t('website-messenger', 'Website messenger'),
    facebook: t('facebook', 'Facebook'),
    instagram: t('kind-instagram', 'Instagram'),
    telegram: t('kind-telegram', 'Telegram'),
    discord: t('kind-discord', 'Discord'),
    mail: t('kind-mail', 'Email'),
    call: t('grandstream-pbx', 'Grandstream PBX'),
    callpro: t('kind-callpro', 'CallPro'),
  };
};

/** What each kind brings into a channel, in a line under its name. */
const useKindHints = (): Record<string, string> => {
  const { t } = useTranslation('frontline');

  return {
    messenger: t('kind-hint-messenger', 'A chat box on your website or app.'),
    facebook: t('kind-hint-facebook', 'A page’s Messenger chats and post comments.'),
    instagram: t('kind-hint-instagram', 'An Instagram account’s direct messages.'),
    telegram: t('kind-hint-telegram', 'Chats with your Telegram bot.'),
    discord: t('kind-hint-discord', 'Messages to your Discord bot.'),
    mail: t('kind-hint-mail', 'A mailbox that receives and sends email.'),
    call: t('kind-hint-call', 'Calls through a Grandstream PBX.'),
    callpro: t('kind-hint-callpro', 'Calls through a CallPro line.'),
  };
};

/**
 * One kind on its card, as old erxes listed them: its mark on a tile, its name and what it
 * brings, how many this channel has, and the button that adds one.
 */
const KindCard = ({ kind, count, action }: { kind: string; count: number; action: ReactNode }) => {
  const { t } = useTranslation('frontline');
  const titles = useKindTitles();
  const hints = useKindHints();

  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-background p-4">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted">
          <KindIcon kind={kind} className="size-6" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{titles[kind] ?? kind}</span>
          <span className="text-xs text-muted-foreground">{hints[kind]}</span>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {count > 0
            ? t('kind-connected', {
                defaultValue_one: '{{count}} in this channel',
                defaultValue_other: '{{count}} in this channel',
                count,
              })
            : t('kind-none', 'None yet')}
        </span>
        {action}
      </div>
    </li>
  );
};

/** Facebook and Instagram's button: Meta's login, or the Meta app's settings when there is none. */
const MetaAction = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const meta = useConnectMeta();
  const app = useMetaApp();

  if (app === false)
    return (
      <Link
        to={META_SETTINGS}
        title={t('meta-app-missing', 'Set up a Meta app in Settings first')}
        className={buttonVariants({ variant: 'outline', size: 'sm' })}
      >
        <IconAlertTriangle />
        {t('set-up', 'Set up')}
      </Link>
    );

  // Off until the check answers, so a quick click never starts a login that has no app.
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={app === undefined || meta.isPending}
      onClick={() => meta.mutate({ channelId })}
    >
      <IconPlus />
      {t('connect', 'Connect')}
    </Button>
  );
};

/**
 * Every kind of integration that brings conversations into the channel, a card each: a website
 * messenger, which the channel's admins add, then the providers a member who manages
 * integrations connects (Facebook and Instagram through Meta's login, the rest with their form
 * in the side panel). What is made joins the channel.
 */
export const IntegrationCatalog = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const canConnect = useCanConnect();

  const ours = (useQuery(integrationsQuery).data ?? []).filter(
    (integration) => integration.channelId === channelId,
  );

  const countOf = (...kinds: string[]) =>
    ours.filter((integration) => kinds.includes(integration.kind)).length;

  const add = (onClick: () => void) => (
    <Button variant="outline" size="sm" onClick={onClick}>
      <IconPlus />
      {t('add', 'Add')}
    </Button>
  );

  return (
    <ul
      aria-label={t('add-an-integration', 'Add an integration')}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
    >
      <KindCard
        kind="messenger"
        count={countOf('messenger')}
        action={add(() => openNew(INTEGRATION_TYPE, { channelId }))}
      />
      {canConnect && (
        <>
          <KindCard
            kind="facebook"
            count={countOf('facebook')}
            action={<MetaAction channelId={channelId} />}
          />
          <KindCard
            kind="instagram"
            count={countOf('instagram')}
            action={<MetaAction channelId={channelId} />}
          />
          {FORM_PROVIDERS.map((provider) => (
            <KindCard
              key={provider}
              kind={provider}
              count={countOf(provider)}
              action={add(() => openNew(ACCOUNT_TYPE, { provider, channelId }))}
            />
          ))}
        </>
      )}
    </ul>
  );
};
