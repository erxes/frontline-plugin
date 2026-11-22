import { IconMessageCirclePlus, IconPlus, IconSettings } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import {
  Badge,
  Button,
  buttonVariants,
  PanelField,
  PanelSection,
  Popover,
  RecordTableInlineCell,
  useOpenRecord,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Integration } from '@/inbox/queries.ts';
import { ConnectMenu, useCanConnect } from '@/integrations/ConnectMenu.tsx';
import { messengerPath } from '@/messenger/queries.ts';
import { INTEGRATION_TYPE } from '~/plugin.ts';
import { KindIcon, kindIconOf, useKindNames } from '~/shared/kinds.tsx';
import { integrationsQuery } from '~/shared/reference.ts';
import type { Channel } from './useChannels.ts';

/** The channel's integrations, grouped by kind in the order they were first added. */
const useKinds = (channelId: string) => {
  const integrations = useQuery(integrationsQuery).data ?? [];

  return Map.groupBy(
    integrations.filter((integration) => integration.channelId === channelId),
    (integration) => integration.kind,
  );
};

/** How many integrations bring conversations into the channel, once they load. */
export const useIntegrationCount = (channelId: string) => {
  const { data } = useQuery(integrationsQuery);

  return data?.filter((integration) => integration.channelId === channelId).length;
};

/**
 * The list's Integrations cell: one chip per kind, its icon and how many, as the old channel list
 * showed them. It opens the integrations themselves, each leading to its side panel, and closes
 * once one opens there.
 */
export const IntegrationBadges = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const names = useKindNames();
  const kinds = useKinds(channelId);
  const [shown, setShown] = useState(false);

  if (kinds.size === 0) return <RecordTableInlineCell />;

  return (
    <Popover open={shown} onOpenChange={setShown}>
      <RecordTableInlineCell.Trigger
        variant="field"
        aria-label={t('channel-integrations', 'Integrations: {{kinds}}', {
          kinds: [...kinds]
            .map(([kind, integrations]) => `${names[kind] ?? kind} ${integrations.length}`)
            .join(', '),
        })}
      >
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
      </RecordTableInlineCell.Trigger>
      <RecordTableInlineCell.Content>
        <span className="flex flex-col">
          {[...kinds.values()].flat().map((integration) => (
            <IntegrationButton
              key={integration.id}
              integration={integration}
              onOpen={() => setShown(false)}
            />
          ))}
        </span>
      </RecordTableInlineCell.Content>
    </Popover>
  );
};

/**
 * One integration of a kind: its tinted icon and name, opening it in the side panel, and for a
 * messenger, a link to its settings page. `onOpen` runs once it opened.
 */
const IntegrationButton = ({
  integration,
  onOpen,
}: {
  integration: Integration;
  onOpen?: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();

  return (
    <span className="flex min-w-0 flex-1 items-center">
      <Button
        variant="ghost"
        size="sm"
        className="min-w-0 flex-1 justify-start"
        onClick={() => {
          open({ contentType: INTEGRATION_TYPE, contentId: integration.id });
          onOpen?.();
        }}
      >
        <KindIcon kind={integration.kind} />
        <span className="min-w-0 flex-1 truncate text-left">{integration.name}</span>
        {!integration.isActive && (
          <span className="text-muted-foreground">{t('archived', 'Archived')}</span>
        )}
      </Button>
      {integration.kind === 'messenger' && (
        <Link
          to={messengerPath(integration.id)}
          aria-label={t('messenger-settings-of', 'Settings of {{name}}', {
            name: integration.name,
          })}
          title={t('messenger-settings', 'Messenger settings')}
          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        >
          <IconSettings />
        </Link>
      )}
    </span>
  );
};

/**
 * One integration of the channel's list: its kind's mark on a tile, its name over its kind,
 * opening it in the side panel, whether it is active, and for a messenger its settings page.
 */
const IntegrationRow = ({ integration }: { integration: Integration }) => {
  const { t } = useTranslation('frontline');
  const names = useKindNames();
  const { open } = useOpenRecord();

  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted">
        <KindIcon kind={integration.kind} className="size-5" />
      </span>
      <button
        type="button"
        onClick={() => open({ contentType: INTEGRATION_TYPE, contentId: integration.id })}
        className="flex min-w-0 flex-1 flex-col rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate text-sm font-medium hover:underline">{integration.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {names[integration.kind] ?? integration.kind}
        </span>
      </button>
      {integration.isActive ? (
        <Badge variant="success">{t('active', 'Active')}</Badge>
      ) : (
        <Badge variant="secondary">{t('archived', 'Archived')}</Badge>
      )}
      {integration.kind === 'messenger' && (
        <Link
          to={messengerPath(integration.id)}
          aria-label={t('messenger-settings-of', 'Settings of {{name}}', {
            name: integration.name,
          })}
          title={t('messenger-settings', 'Messenger settings')}
          className={buttonVariants({ variant: 'ghost', size: 'icon' })}
        >
          <IconSettings />
        </Link>
      )}
    </li>
  );
};

/**
 * Every integration of the channel, or of its one `kind`, a row each with its mark, name, kind and
 * state, opening it in the side panel. A channel with none says so.
 */
export const ChannelIntegrationList = ({
  channelId,
  kind,
}: {
  channelId: string;
  kind?: string;
}) => {
  const { t } = useTranslation('frontline');

  const integrations = [...useKinds(channelId).values()]
    .flat()
    .filter((integration) => !kind || integration.kind === kind);

  if (integrations.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        {kind
          ? t('no-kind-in-channel', 'None in this channel yet.')
          : t('no-channel-integrations', 'No conversations come into this channel yet.')}
      </p>
    );
  }

  return (
    <ul className="flex flex-col divide-y">
      {integrations.map((integration) => (
        <IntegrationRow key={integration.id} integration={integration} />
      ))}
    </ul>
  );
};

/**
 * The Detail tab's Integrations section: each kind the channel takes conversations through, with
 * its pages, bots and mailboxes, as the old channel page's cards showed them. Its admins add a
 * website messenger here, connect an account straight into it, or add one connected before.
 */
export const ChannelIntegrations = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const names = useKindNames();
  const { openNew } = useOpenRecord();
  const kinds = useKinds(channel.id);
  const canConnect = useCanConnect();

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
            {canConnect && <ConnectMenu channelId={channel.id} />}
          </span>
        </PanelField>
      )}
    </PanelSection>
  );
};
