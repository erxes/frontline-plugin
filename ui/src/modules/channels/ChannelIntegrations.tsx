import { IconMessageCirclePlus, IconPlugConnected, IconPlus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Button,
  buttonVariants,
  PanelField,
  PanelSection,
  RecordTableInlineCell,
  useOpenRecord,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Integration } from '@/inbox/queries.ts';
import { INTEGRATION_TYPE, PLUGIN } from '~/plugin.ts';
import { KindIcon, kindIconOf, useKindNames } from '~/shared/kinds.tsx';
import { integrationsQuery } from '~/shared/reference.ts';
import type { Channel } from './useChannels.ts';

/** Where a page, bot or mailbox is connected before it joins a channel. */
const ACCOUNTS_PATH = `/${PLUGIN}/settings/integrations`;

/** The channel's integrations, grouped by kind in the order they were first added. */
const useKinds = (channelId: string) => {
  const integrations = useQuery(integrationsQuery).data ?? [];

  return Map.groupBy(
    integrations.filter((integration) => integration.channelId === channelId),
    (integration) => integration.kind,
  );
};

/**
 * The list's Integrations cell: one chip per kind, its icon and how many, as the old channel list
 * showed them.
 */
export const IntegrationBadges = ({ channelId }: { channelId: string }) => {
  const names = useKindNames();
  const kinds = useKinds(channelId);

  return (
    <RecordTableInlineCell>
      <span className="flex gap-1">
        {[...kinds].map(([kind, integrations]) => (
          <span
            key={kind}
            title={names[kind] ?? kind}
            className="inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-xs tabular-nums"
          >
            <KindIcon kind={kind} className="size-3.5" />
            {integrations.length}
          </span>
        ))}
      </span>
    </RecordTableInlineCell>
  );
};

/** One integration of a kind: its tinted icon and name, opening it in the side panel. */
const IntegrationButton = ({ integration }: { integration: Integration }) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start"
      onClick={() => open({ contentType: INTEGRATION_TYPE, contentId: integration.id })}
    >
      <KindIcon kind={integration.kind} />
      <span className="min-w-0 flex-1 truncate text-left">{integration.name}</span>
      {!integration.isActive && (
        <span className="text-muted-foreground">{t('archived', 'Archived')}</span>
      )}
    </Button>
  );
};

/**
 * The Detail tab's Integrations section: each kind the channel takes conversations through, with
 * its pages, bots and mailboxes, as the old channel page's cards showed them. Its admins add a
 * website messenger here, or connect an account to add.
 */
export const ChannelIntegrations = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const names = useKindNames();
  const { openNew } = useOpenRecord();
  const kinds = useKinds(channel.id);

  return (
    <PanelSection title={t('integrations', 'Integrations')}>
      {[...kinds].map(([kind, integrations]) => (
        <PanelField
          key={kind}
          icon={kindIconOf(kind)}
          label={`${names[kind] ?? kind} · ${integrations.length}`}
          cell={false}
        >
          <span className="flex min-w-0 flex-col">
            {integrations.map((integration) => (
              <IntegrationButton key={integration.id} integration={integration} />
            ))}
          </span>
        </PanelField>
      ))}
      {kinds.size === 0 && (
        <p className="px-2 py-1 text-xs text-muted-foreground">
          {t('no-channel-integrations', 'No conversations come into this channel yet.')}
        </p>
      )}
      {channel.canManage && (
        <PanelField icon={IconPlus} label={t('add', 'Add')} cell={false}>
          <span className="flex min-w-0 flex-wrap gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openNew(INTEGRATION_TYPE, { channelId: channel.id })}
            >
              <IconMessageCirclePlus />
              {t('add-messenger', 'Add messenger')}
            </Button>
            <Link to={ACCOUNTS_PATH} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              <IconPlugConnected />
              {t('connect-account', 'Connect an account')}
            </Link>
          </span>
        </PanelField>
      )}
    </PanelSection>
  );
};
