import {
  IconAlignLeft,
  IconCalendarPlus,
  IconDots,
  IconIcons,
  IconLetterCase,
  IconInbox,
  IconPlugConnected,
  IconTicket,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { CHANNEL_ICON } from '~/shared/icons.ts';
import {
  Button,
  IconPicker,
  PanelField,
  PanelSection,
  Skeleton,
  Spinner,
  TextField,
  type TRecordSlotProps,
  useFormat,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useChoices } from '@/tickets/queries.ts';
import { orpc } from '~/orpc.ts';
import { InfoRow, PageLink, ReadOnly } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { channelRule, INBOX_PATH, listPath, ticketsPath } from '~/shared/listPath.ts';
import { useIntegrationCount } from './ChannelIntegrations.tsx';
import { type Channel, useChannel, useChannelChange, useDeleteChannels } from './useChannels.ts';
import { MemberChip } from '~/shared/Person.tsx';

/** The panel header's title: the channel's name. */
export const ChannelTitle = ({ contentId }: TRecordSlotProps) => {
  const channel = useChannel(contentId);

  if (channel.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{channel.data?.name ?? channel.error?.message}</span>;
};

/** The header's menu, for the channel's admins: delete it. */
export const ChannelActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const channel = useChannel(contentId);
  const { deleteChannels } = useDeleteChannels();

  if (!channel.data?.canManage) return null;

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('channel-menu', 'Channel actions')}>
          <IconDots />
        </Button>
      }
      actions={[
        {
          value: 'delete',
          icon: <IconTrash />,
          label: t('delete', 'Delete'),
          onSelect: () => void deleteChannels([contentId]),
        },
      ]}
    />
  );
};

/** Saves one field of the channel at a time, refetching the lists after it. */
const useEditChannel = (channel: Channel) => {
  const update = useMutation(orpc.channels.update.mutationOptions(useChannelChange()));

  return (fields: { name?: string; description?: string; icon?: string | null }) =>
    update.mutate({ id: channel.id, name: channel.name, ...fields });
};

/**
 * Where the channel's work lands: its conversations in the inbox and the tickets of its first
 * pipeline. Until it takes conversations in and turns them into tickets, the steps that are
 * left show instead, each leading to the tab that does it.
 */
const ChannelWork = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const integrations = useIntegrationCount(channel.id);
  const pipeline = useChoices().pipelines.find((one) => one.channelId === channel.id);

  return (
    <PanelSection title={t('channel-work', 'Work')}>
      <PanelField icon={IconInbox} label={t('conversations', 'Conversations')} cell={false}>
        <PageLink
          to={listPath(INBOX_PATH, channelRule(channel.id))}
          label={t('open-in-inbox', 'Open in inbox')}
          count=""
        />
      </PanelField>
      <PanelField icon={IconTicket} label={t('tickets', 'Tickets')} cell={false}>
        {pipeline ? (
          <PageLink
            to={ticketsPath(pipeline.id)}
            label={t('open-tickets', 'Open tickets')}
            count={pipeline.name}
          />
        ) : (
          <span className="px-2 text-xs text-muted-foreground">
            {t('no-pipeline-short', 'No ticket pipeline yet')}
          </span>
        )}
      </PanelField>
      {integrations === 0 && (
        <InfoRow icon={IconPlugConnected} label={t('next-step', 'Next step')}>
          {t('add-first-integration', 'Add a messenger or connect a page in the Integrations tab.')}
        </InfoRow>
      )}
    </PanelSection>
  );
};

/** The channel's own fields, edited in place by its admins and read only for its other members. */
const ChannelFields = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const edit = useEditChannel(channel);
  const scope = `frontline-channel.${channel.id}`;

  return (
    <PanelSection title={t('channel', 'Channel')}>
      <ReadOnly when={!channel.canManage}>
        <PanelField icon={IconLetterCase} label={t('name', 'Name')}>
          <TextField
            scope={`${scope}.name`}
            value={channel.name}
            placeholder={t('name', 'Name')}
            onSave={(name) => {
              const next = name.trim();

              if (next && next !== channel.name) edit({ name: next });
            }}
          />
        </PanelField>
        <PanelField icon={IconAlignLeft} label={t('description', 'Description')}>
          <TextField
            scope={`${scope}.description`}
            value={channel.description}
            placeholder={t('description', 'Description')}
            onSave={(description) => edit({ description: description.trim() })}
          />
        </PanelField>
        <PanelField icon={IconIcons} label={t('icon', 'Icon')} cell={false}>
          <IconPicker
            aria-label={t('icon', 'Icon')}
            value={channel.icon ?? CHANNEL_ICON}
            onValueChange={(icon) => edit({ icon })}
            className="w-min"
          />
        </PanelField>
      </ReadOnly>
      <InfoRow icon={IconUser} label={t('created-by', 'Created by')}>
        <MemberChip id={channel.createdBy} />
      </InfoRow>
      <InfoRow icon={IconCalendarPlus} label={t('created-at', 'Created at')}>
        {format.dateTime(channel.createdAt)}
      </InfoRow>
    </PanelSection>
  );
};

/**
 * The Detail tab: the channel's fields, then where its work lands. Its integrations, pipelines,
 * members and templates are the panel's other tabs.
 */
export const ChannelDetail = ({ contentId }: TRecordSlotProps) => {
  const channel = useChannel(contentId);

  if (channel.isPending) return <Spinner area="lg" />;

  if (channel.isError) {
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {channel.error.message}
      </p>
    );
  }

  return (
    <>
      <ChannelFields channel={channel.data} />
      <ChannelWork channel={channel.data} />
    </>
  );
};
