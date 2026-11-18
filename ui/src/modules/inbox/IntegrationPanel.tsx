import {
  IconArchive,
  IconArrowsExchange,
  IconChevronRight,
  IconCircles,
  IconDots,
  IconKey,
  IconLetterCase,
  IconPower,
  IconRestore,
  IconSettings,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Button,
  buttonVariants,
  CopyText,
  PanelField,
  PanelSection,
  Skeleton,
  Spinner,
  TextField,
  type TRecordSlotProps,
  useConfirm,
  useOpenRecord,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { messengerPath } from '@/messenger/queries.ts';
import { orpc } from '~/orpc.ts';
import { CHANNEL_TYPE } from '~/plugin.ts';
import { ChannelLabel } from '~/shared/ChannelSelect.tsx';
import { MoveToChannelDialog } from '~/shared/MoveToChannel.tsx';
import { channelsQuery } from '~/shared/reference.ts';
import { InfoRow, ReadOnly } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { useKindNames } from '~/shared/kinds.tsx';
import { type Integration, useIntegration, useIntegrationChange } from './queries.ts';
import { MemberChip } from '~/shared/Person.tsx';

/** The panel header's title: the integration's name. */
export const IntegrationTitle = ({ contentId }: TRecordSlotProps) => {
  const integration = useIntegration(contentId);

  if (integration.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{integration.data?.name ?? integration.error?.message}</span>;
};

/**
 * The header's menu: a messenger's settings page, and for its channel's admins, archiving it,
 * moving it to another channel, or deleting it with its conversations. An archived integration
 * takes no new messages and leaves the inbox's pickers, as the old plugin's did.
 */
export const IntegrationActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const integration = useIntegration(contentId).data;
  const { confirm } = useConfirm();
  const [moving, setMoving] = useState(false);
  const change = useIntegrationChange();
  const remove = useMutation(orpc.integrations.remove.mutationOptions(change));
  const update = useMutation(orpc.integrations.update.mutationOptions(change));

  if (!integration) return null;

  const settings =
    integration.kind === 'messenger'
      ? [
          {
            value: 'settings',
            icon: <IconSettings />,
            label: t('messenger-settings', 'Messenger settings'),
            onSelect: () => void navigate(messengerPath(integration.id)),
          },
        ]
      : [];

  const manage = integration.canManage
    ? [
        {
          value: 'archive',
          icon: integration.isActive ? <IconArchive /> : <IconRestore />,
          label: integration.isActive ? t('archive', 'Archive') : t('unarchive', 'Unarchive'),
          onSelect: () => update.mutate({ id: integration.id, isActive: !integration.isActive }),
        },
        {
          value: 'move',
          icon: <IconArrowsExchange />,
          label: t('move-to-channel', 'Move to channel'),
          onSelect: () => setMoving(true),
        },
        {
          value: 'delete',
          icon: <IconTrash />,
          label: t('delete', 'Delete'),
          onSelect: () =>
            void confirm({
              message: t(
                'delete-integration-confirm',
                'Delete this integration and its conversations?',
              ),
            }).then(() => remove.mutate({ id: contentId })),
        },
      ]
    : [];

  if (settings.length + manage.length === 0) return null;

  return (
    <>
      <ActionsMenu
        trigger={
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('integration-menu', 'Integration actions')}
          >
            <IconDots />
          </Button>
        }
        actions={[...settings, ...manage]}
      />
      {moving && (
        <MoveToChannelDialog
          name={integration.name}
          channelId={integration.channelId}
          onMove={(channelId) => update.mutateAsync({ id: integration.id, channelId })}
          onClose={() => setMoving(false)}
        />
      )}
    </>
  );
};

const Fields = ({ integration }: { integration: Integration }) => {
  const { t } = useTranslation('frontline');
  const update = useMutation(orpc.integrations.update.mutationOptions(useIntegrationChange()));
  const { open } = useOpenRecord();

  const channel = useQuery(channelsQuery).data?.channels.find(
    ({ id }) => id === integration.channelId,
  );

  const scope = `frontline-integration.${integration.id}`;
  const messenger = integration.kind === 'messenger';
  const kind = useKindNames()[integration.kind] ?? integration.kind;

  return (
    <PanelSection title={kind}>
      <ReadOnly when={!integration.canManage}>
        <PanelField icon={IconLetterCase} label={t('name', 'Name')}>
          <TextField
            scope={`${scope}.name`}
            value={integration.name}
            placeholder={t('name', 'Name')}
            onSave={(name) => {
              const next = name.trim();

              if (next && next !== integration.name)
                update.mutate({ id: integration.id, name: next });
            }}
          />
        </PanelField>
        {messenger && (
          <PanelField icon={IconSettings} label={t('settings', 'Settings')} cell={false}>
            <Link
              to={messengerPath(integration.id)}
              className={buttonVariants({
                variant: 'ghost',
                size: 'sm',
                className: 'justify-start',
              })}
            >
              {t('messenger-settings-open', 'Look, hours and install code')}
              <IconChevronRight />
            </Link>
          </PanelField>
        )}
      </ReadOnly>
      <InfoRow icon={IconPower} label={t('status', 'Status')}>
        {integration.isActive ? t('active', 'Active') : t('archived', 'Archived')}
      </InfoRow>
      {channel && (
        <PanelField icon={IconCircles} label={t('channel', 'Channel')} cell={false}>
          <Button
            variant="ghost"
            size="sm"
            className="justify-start"
            onClick={() => open({ contentType: CHANNEL_TYPE, contentId: channel.id })}
          >
            <ChannelLabel id={channel.id} />
          </Button>
        </PanelField>
      )}
      {messenger && integration.publicKey && (
        <PanelField icon={IconKey} label={t('messenger-key', 'Messenger key')} cell={false}>
          <div className="min-w-0 px-2">
            <CopyText value={integration.publicKey}>
              <span className="truncate font-mono text-xs">{integration.publicKey}</span>
            </CopyText>
          </div>
        </PanelField>
      )}
      <InfoRow icon={IconUser} label={t('created-by', 'Created by')}>
        <MemberChip id={integration.createdBy} />
      </InfoRow>
    </PanelSection>
  );
};

/** The Detail tab: the messenger's fields, and the key its website embed carries. */
export const IntegrationDetail = ({ contentId }: TRecordSlotProps) => {
  const integration = useIntegration(contentId);

  if (integration.isPending) return <Spinner area="lg" />;

  if (integration.isError)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {integration.error.message}
      </p>
    );

  return <Fields integration={integration.data} />;
};
