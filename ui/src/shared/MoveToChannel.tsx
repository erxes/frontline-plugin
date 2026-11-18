import { useQuery } from '@tanstack/react-query';
import { Dialog, EntityPicker, toast } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { channelsQuery } from '~/shared/reference.ts';

/**
 * Moves the record `name` out of `channelId` to another channel the member is
 * an admin of: `onMove` saves it, then the dialog says where it went and closes.
 */
export const MoveToChannelDialog = ({
  name,
  channelId,
  onMove,
  onClose,
}: {
  name: string;
  channelId: string;
  onMove: (channelId: string) => Promise<unknown>;
  onClose: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const channels = useQuery(channelsQuery);

  const targets = (channels.data?.channels ?? []).filter(
    (channel) => channel.canManage && channel.id !== channelId,
  );

  const move = async (target: string) => {
    await onMove(target);
    toast({
      title: t('resources-moved-to-channel', 'Moved to {{channel}}', {
        channel: targets.find((channel) => channel.id === target)?.name,
      }),
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>{t('move-to-channel', 'Move to channel')}</Dialog.Title>
          <Dialog.Description>
            {t('move-to-channel-hint', 'Pick the channel {{name}} moves to.', { name })}
          </Dialog.Description>
        </Dialog.Header>
        <EntityPicker
          items={targets}
          itemKey={(channel) => ({ id: channel.id, label: channel.name })}
          value={[]}
          onValueChange={([target]) => target && void move(target)}
          loading={channels.isPending}
          error={channels.error}
          searchPlaceholder={t('search-channels', 'Search channels')}
        />
      </Dialog.Content>
    </Dialog>
  );
};
