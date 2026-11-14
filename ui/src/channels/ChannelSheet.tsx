import { isDefinedError } from '@orpc/client';
import { useMutation } from '@tanstack/react-query';
import { Button, Input, Label, Sheet, Textarea, useConfirm } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '../orpc.ts';
import { ChannelMembers } from './ChannelMembers.tsx';
import { type Channel, useChannelChange, useOpenChannel } from './useChannels.ts';

const textOf = (value: FormDataEntryValue | null) => (typeof value === 'string' ? value : '');

/** A new channel (`channel` undefined) or a change to one. CHANNEL_NAME_TAKEN shows on the name field. */
const ChannelForm = ({ channel }: { channel?: Channel }) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenChannel();
  const { onSuccess } = useChannelChange();

  const create = useMutation(
    orpc.channels.create.mutationOptions({
      onSuccess: async (created) => {
        await onSuccess();
        open(created.id);
      },
    }),
  );

  const update = useMutation(orpc.channels.update.mutationOptions({ onSuccess }));
  const { error, isPending } = channel ? update : create;

  const takenName =
    isDefinedError(error) && error.code === 'CHANNEL_NAME_TAKEN' ? error.data.name : null;

  const save = (form: FormData) => {
    const fields = {
      name: textOf(form.get('name')),
      description: textOf(form.get('description')),
    };

    if (channel) update.mutate({ id: channel.id, ...fields });
    else create.mutate(fields);
  };

  return (
    <form action={save} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="channel-name">{t('name', 'Name')}</Label>
        <Input
          id="channel-name"
          name="name"
          required
          defaultValue={channel?.name}
          aria-invalid={takenName !== null}
          aria-describedby={takenName === null ? undefined : 'channel-name-error'}
        />
        {takenName !== null && (
          <p id="channel-name-error" className="text-sm text-destructive-text">
            {t('name-taken', 'Another channel is already called {{name}}.', { name: takenName })}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="channel-description">{t('description', 'Description')}</Label>
        <Textarea id="channel-description" name="description" defaultValue={channel?.description} />
      </div>
      {error && !isDefinedError(error) && (
        <p role="alert" className="text-sm text-destructive-text">
          {error.message}
        </p>
      )}
      <Button type="submit" className="self-start" disabled={isPending}>
        {t('save', 'Save')}
      </Button>
    </form>
  );
};

const DeleteChannel = ({ channel }: { channel: Channel }) => {
  const { t } = useTranslation('frontline');
  const { confirm } = useConfirm();
  const { close } = useOpenChannel();
  const change = useChannelChange();

  const remove = useMutation(
    orpc.channels.remove.mutationOptions({
      ...change,
      onSuccess: async () => {
        close();
        await change.onSuccess();
      },
    }),
  );

  return (
    <Button
      variant="destructive"
      className="self-start"
      disabled={remove.isPending}
      onClick={() =>
        void confirm({
          message: t('delete-channel-confirm', 'Delete {{name}} and its members list?', {
            name: channel.name,
          }),
          options: { okLabel: t('delete', 'Delete') },
        }).then(() => remove.mutate({ id: channel.id }))
      }
    >
      {t('delete-channel', 'Delete channel')}
    </Button>
  );
};

/** The channel's details: editable for its admins, then its members. */
const ChannelDetails = ({ channel }: { channel: Channel }) => (
  <div className="flex flex-col gap-6">
    {channel.canManage ? (
      <ChannelForm key={channel.id} channel={channel} />
    ) : (
      channel.description && <p className="text-sm">{channel.description}</p>
    )}
    <ChannelMembers channel={channel} />
    {channel.canManage && <DeleteChannel channel={channel} />}
  </div>
);

/** The side panel: a new channel, or one from the list. */
export const ChannelSheet = ({ channels }: { channels: Channel[] }) => {
  const { t } = useTranslation('frontline');
  const { openId, close } = useOpenChannel();
  const channel = channels.find((candidate) => candidate.id === openId);

  return (
    <Sheet open={Boolean(openId)} onOpenChange={(open) => !open && close()}>
      <Sheet.View className="sm:max-w-md">
        <Sheet.Header>
          <Sheet.Title>{channel ? channel.name : t('new-channel', 'New channel')}</Sheet.Title>
          <Sheet.Description className="sr-only">
            {channel
              ? t('channel-hint', 'The channel and the members who work it.')
              : t('new-channel-hint', 'Name the channel. You become its admin.')}
          </Sheet.Description>
          <Sheet.Close />
        </Sheet.Header>
        <Sheet.Content>
          {openId === 'new' ? (
            <ChannelForm />
          ) : channel ? (
            <ChannelDetails channel={channel} />
          ) : (
            <p className="text-sm text-muted-foreground">
              {t('channel-not-found', 'This channel is not in the list.')}
            </p>
          )}
        </Sheet.Content>
      </Sheet.View>
    </Sheet>
  );
};
