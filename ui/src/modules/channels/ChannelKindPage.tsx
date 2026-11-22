import { IconExternalLink, IconMessageCirclePlus, IconPlus } from '@tabler/icons-react';
import { Button, buttonVariants, Card, cn, Form, useOpenRecord } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCanConnect, useOutsideAccounts } from '@/integrations/ConnectMenu.tsx';
import { integrationPage } from '@/integrations/keys.ts';
import { useKindHints, useKindTitles } from '@/integrations/kindText.ts';
import { INTEGRATION_TYPE } from '~/plugin.ts';
import { KindIcon } from '~/shared/kinds.tsx';
import { ChannelIntegrationList } from './ChannelIntegrations.tsx';
import type { Channel } from './useChannels.ts';

/**
 * The accounts of `kind` the organisation connected in core's Integrations that no channel uses
 * yet, each added to this channel with a click, then where to connect another.
 */
const AddAccount = ({ channel, kind }: { channel: Channel; kind: string }) => {
  const { t } = useTranslation('frontline');
  const titles = useKindTitles();
  const canConnect = useCanConnect();
  const { outside, add } = useOutsideAccounts(channel.id);
  const free = outside.filter((account) => account.provider === kind);

  return (
    <div className="flex flex-col gap-3">
      {free.length > 0 && (
        <Card className="overflow-hidden">
          <ul className="flex flex-col divide-y">
            {free.map((account) => (
              <li key={account.id} className="flex items-center gap-3 px-3 py-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
                  <KindIcon kind={account.provider} className="size-5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{account.name}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={add.isPending}
                  onClick={() =>
                    add.mutate({
                      channelId: channel.id,
                      kind: account.provider,
                      name: account.name,
                      config: { accountId: account.id },
                    })
                  }
                >
                  <IconPlus />
                  {t('add-to-channel', 'Add to a channel')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {free.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t(
            'no-free-accounts',
            'No {{kind}} account is free to add. Connect one in Integrations.',
            {
              kind: titles[kind] ?? kind,
            },
          )}
        </p>
      )}
      {canConnect && (
        <Link
          to={integrationPage(kind)}
          className={cn(buttonVariants({ variant: 'outline' }), 'self-start')}
        >
          <IconExternalLink />
          {t('connect-in-integrations', 'Connect in Integrations')}
        </Link>
      )}
    </div>
  );
};

/**
 * One kind of integration inside the channel: what it brings, the ones bringing the channel
 * conversations now, then for its admins how to add another. A website messenger is the
 * channel's own and is made here; a provider's accounts are the organisation's, connected once in
 * core's Integrations, and the channel picks the ones that come to it.
 */
export const ChannelKindPage = ({ channel, kind }: { channel: Channel; kind: string }) => {
  const { t } = useTranslation('frontline');
  const { openNew } = useOpenRecord();
  const titles = useKindTitles();
  const hints = useKindHints();
  const title = titles[kind] ?? kind;

  return (
    <>
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-muted">
          <KindIcon kind={kind} className="size-7" />
        </span>
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{hints[kind]}</p>
        </div>
      </div>
      <Form.Section title={t('in-this-channel', 'In this channel')}>
        <Card className="overflow-hidden">
          <ChannelIntegrationList channelId={channel.id} kind={kind} />
        </Card>
      </Form.Section>
      {channel.canManage && (
        <Form.Section title={t('add-kind', 'Add {{kind}}', { kind: title })}>
          {kind === 'messenger' ? (
            <Button
              className="self-start"
              onClick={() => openNew(INTEGRATION_TYPE, { channelId: channel.id })}
            >
              <IconMessageCirclePlus />
              {t('add-messenger', 'Add messenger')}
            </Button>
          ) : (
            <AddAccount channel={channel} kind={kind} />
          )}
        </Form.Section>
      )}
    </>
  );
};
