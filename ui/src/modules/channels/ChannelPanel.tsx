import {
  IconAlignLeft,
  IconCalendarPlus,
  IconDots,
  IconIcons,
  IconLetterCase,
  IconMessageReply,
  IconSitemap,
  IconTrash,
  IconUser,
  IconUsers,
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
import { usePipelineCount } from '@/pipelines/usePipelines.ts';
import { useTemplateCount } from '@/responseTemplates/useResponseTemplates.ts';
import { orpc } from '~/orpc.ts';
import { InfoRow, PageLink, ReadOnly } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { ChannelIntegrations } from './ChannelIntegrations.tsx';
import {
  type Channel,
  CHANNELS_PATH,
  useChannel,
  useChannelChange,
  useDeleteChannels,
} from './useChannels.ts';
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

/** The channel's members, response templates and pipelines, each a page of its own. */
const ChannelPages = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const templateCount = useTemplateCount(channel.id);
  const pipelineCount = usePipelineCount(channel.id);

  // A count still loading shows nothing rather than zero.
  const counted = (key: string, one: string, other: string, count: number | undefined) =>
    count === undefined ? '' : t(key, { defaultValue_one: one, defaultValue_other: other, count });

  return (
    <PanelSection title={t('channel-pages', 'Channel settings')}>
      <PanelField icon={IconUsers} label={t('members', 'Members')} cell={false}>
        <PageLink
          to={`${CHANNELS_PATH}/${channel.id}/members`}
          label={t('manage-channel-members', 'Manage channel members')}
          count={counted(
            'member-count',
            '{{count}} member',
            '{{count}} members',
            channel.memberIds.length,
          )}
        />
      </PanelField>
      <PanelField
        icon={IconMessageReply}
        label={t('response-templates', 'Response templates')}
        cell={false}
      >
        <PageLink
          to={`${CHANNELS_PATH}/${channel.id}/response`}
          label={t('manage-channel-response-templates', 'Manage channel response templates')}
          count={counted(
            'template-count',
            '{{count}} template',
            '{{count}} templates',
            templateCount,
          )}
        />
      </PanelField>
      <PanelField icon={IconSitemap} label={t('pipelines', 'Pipelines')} cell={false}>
        <PageLink
          to={`${CHANNELS_PATH}/${channel.id}/pipelines`}
          label={t('manage-channel-pipelines', 'Manage channel pipelines')}
          count={counted(
            'pipeline-count',
            '{{count}} pipeline',
            '{{count}} pipelines',
            pipelineCount,
          )}
        />
      </PanelField>
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
 * The Detail tab: the channel's fields, the integrations its conversations come through, then
 * links to its members, templates and pipelines.
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
      <ChannelIntegrations channel={channel.data} />
      <ChannelPages channel={channel.data} />
    </>
  );
};
