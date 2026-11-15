import { IconCircles } from '@tabler/icons-react';
import { PanelFormRow, Select } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useChannels } from '@/channels/useChannels.ts';

/** Channel names by id, for the channels the member sees. */
export const useChannelNames = () =>
  new Map((useChannels().data?.channels ?? []).map((channel) => [channel.id, channel.name]));

/** The channels the member is an admin of, the ones a new record can go in. */
export const useManagedChannels = () =>
  (useChannels().data?.channels ?? []).filter((channel) => channel.canManage);

/**
 * A pick of one channel the member is an admin of. The record's own channel is listed too, so a
 * member who only reads the record sees its name.
 */
export const ChannelSelect = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (channelId: string) => void;
}) => {
  const { t } = useTranslation('frontline');

  const channels = (useChannels().data?.channels ?? []).filter(
    (channel) => channel.canManage || channel.id === value,
  );

  return (
    <Select value={value} onValueChange={(next) => typeof next === 'string' && onChange(next)}>
      <Select.Trigger aria-label={t('channel', 'Channel')}>
        <Select.Value placeholder={t('choose-channel', 'Choose a channel')} />
      </Select.Trigger>
      <Select.Content>
        {channels.map((channel) => (
          <Select.Item key={channel.id} value={channel.id}>
            {channel.name}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};

/**
 * A draft's channel row: the channels the member is an admin of, the first picked until another
 * is, and `missing` under it when there is none.
 */
export const ChannelRow = ({
  value,
  onChange,
  missing,
}: {
  value: string;
  onChange: (channelId: string) => void;
  missing: string;
}) => {
  const { t } = useTranslation('frontline');
  const first = useManagedChannels()[0]?.id ?? '';

  return (
    <PanelFormRow
      label={t('channel', 'Channel')}
      icon={IconCircles}
      required
      error={first ? undefined : missing}
    >
      <ChannelSelect value={value || first} onChange={onChange} />
    </PanelFormRow>
  );
};
