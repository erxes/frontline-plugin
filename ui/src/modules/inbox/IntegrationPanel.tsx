import {
  IconCircles,
  IconDots,
  IconKey,
  IconLetterCase,
  IconMessage,
  IconPower,
  IconSettings,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Button,
  CopyText,
  PanelField,
  PanelSection,
  Skeleton,
  Spinner,
  Switch,
  TextField,
  type TRecordSlotProps,
  useConfirm,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { messengerPath } from '@/messenger/queries.ts';
import { orpc } from '~/orpc.ts';
import { InfoRow, ReadOnly } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { useKindNames } from './InboxFilter.tsx';
import { type Integration, useIntegration, useIntegrationChange } from './queries.ts';
import { MemberChip } from '~/shared/Person.tsx';

/** The panel header's title: the integration's name. */
export const IntegrationTitle = ({ contentId }: TRecordSlotProps) => {
  const integration = useIntegration(contentId);

  if (integration.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{integration.data?.name ?? integration.error?.message}</span>;
};

/**
 * The header's menu: a messenger's settings page, and for its channel's admins, deleting it with
 * its conversations.
 */
export const IntegrationActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const integration = useIntegration(contentId).data;
  const { confirm } = useConfirm();
  const remove = useMutation(orpc.integrations.remove.mutationOptions(useIntegrationChange()));

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
  );
};

const Fields = ({ integration }: { integration: Integration }) => {
  const { t } = useTranslation('frontline');
  const update = useMutation(orpc.integrations.update.mutationOptions(useIntegrationChange()));
  const channels = useQuery(orpc.channels.list.queryOptions({ input: {} })).data?.channels ?? [];
  const welcome = typeof integration.config.welcome === 'string' ? integration.config.welcome : '';
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
          <PanelField icon={IconMessage} label={t('welcome-message', 'Welcome message')}>
            <TextField
              scope={`${scope}.welcome`}
              value={welcome}
              placeholder={t('welcome-message', 'Welcome message')}
              onSave={(next) =>
                update.mutate({
                  id: integration.id,
                  config: { ...integration.config, welcome: next },
                })
              }
            />
          </PanelField>
        )}
        <PanelField icon={IconPower} label={t('active', 'Active')} cell={false}>
          <Switch
            aria-label={t('active', 'Active')}
            checked={integration.isActive}
            onCheckedChange={(isActive) => update.mutate({ id: integration.id, isActive })}
          />
        </PanelField>
      </ReadOnly>
      <InfoRow icon={IconCircles} label={t('channel', 'Channel')}>
        {channels.find((channel) => channel.id === integration.channelId)?.name}
      </InfoRow>
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
