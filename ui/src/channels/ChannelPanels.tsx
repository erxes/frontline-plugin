import { memberQueries } from '@erxes/core-contract/client';
import { isDefinedError } from '@orpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Button,
  EntityPicker,
  IconPicker,
  Input,
  MemberInline,
  memberName,
  Skeleton,
  Textarea,
} from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { orpc } from '../orpc.ts';
import { textOf } from '../shared/hooks.ts';
import { Field, SidePanel } from '../shared/SidePanel.tsx';
import {
  type Channel,
  CHANNELS_PATH,
  useChannel,
  useChannelChange,
  usePanel,
} from './useChannels.ts';

/** Team members to pick, several at once, leaving out `exclude`. */
const MemberPicker = ({
  value,
  onValueChange,
  exclude = [],
}: {
  value: string[];
  onValueChange: (ids: string[]) => void;
  exclude?: string[];
}) => {
  const { t } = useTranslation('frontline');
  const team = useQuery(memberQueries.team);
  const items = (team.data?.data ?? []).filter((member) => !exclude.includes(member.id));

  return (
    <EntityPicker
      multiple
      items={items}
      itemKey={(member) => ({ id: member.id, label: memberName(member) })}
      renderItem={(member) => <MemberInline memberId={member.id} members={memberQueries} />}
      value={value}
      onValueChange={onValueChange}
      loading={team.isPending}
      error={team.error}
      searchPlaceholder={t('search-members', 'Search members')}
    />
  );
};

/** Creates the channel and opens it, or saves the change to `channel` and closes the panel. */
const useSaveChannel = (channel?: Channel) => {
  const navigate = useNavigate();
  const { closeChannel } = usePanel();
  const { onSuccess } = useChannelChange();

  const create = useMutation(
    orpc.channels.create.mutationOptions({
      onSuccess: async (created) => {
        await onSuccess();
        void navigate(`${CHANNELS_PATH}/${created.id}`);
      },
    }),
  );

  const update = useMutation(
    orpc.channels.update.mutationOptions({
      onSuccess: async () => {
        await onSuccess();
        closeChannel();
      },
    }),
  );

  const { error, isPending } = channel ? update : create;

  const save = (
    fields: { name: string; description: string; icon: string | null },
    memberIds: string[],
  ) => {
    if (channel) update.mutate({ id: channel.id, ...fields });
    else create.mutate({ ...fields, memberIds });
  };

  return { save, error, isPending };
};

/** A new channel (`channel` undefined) or a change to one. CHANNEL_NAME_TAKEN shows on the name field. */
const ChannelForm = ({ channel }: { channel?: Channel }) => {
  const { t } = useTranslation('frontline');
  const [icon, setIcon] = useState(channel?.icon ?? null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const { save, error, isPending } = useSaveChannel(channel);

  const takenName =
    isDefinedError(error) && error.code === 'CHANNEL_NAME_TAKEN' ? error.data.name : null;

  // onSubmit rather than a form action, which would clear the fields when the API refuses them.
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    save(
      { name: textOf(form.get('name')), description: textOf(form.get('description')), icon },
      memberIds,
    );
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Field id="channel-icon" label={t('icon', 'Icon')}>
          <IconPicker
            id="channel-icon"
            value={icon ?? undefined}
            onValueChange={setIcon}
            className="w-min"
          />
        </Field>
        <Field id="channel-name" label={t('name', 'Name')} className="flex-1">
          <Input
            id="channel-name"
            name="name"
            required
            defaultValue={channel?.name}
            aria-invalid={takenName !== null}
            aria-describedby={takenName === null ? undefined : 'channel-name-error'}
          />
        </Field>
      </div>
      {takenName !== null && (
        <p id="channel-name-error" className="text-sm text-destructive-text">
          {t('name-taken', 'Another channel is already called {{name}}.', { name: takenName })}
        </p>
      )}
      <Field id="channel-description" label={t('description', 'Description')}>
        <Textarea id="channel-description" name="description" defaultValue={channel?.description} />
      </Field>
      {!channel && (
        <Field label={t('members', 'Members')}>
          <MemberPicker value={memberIds} onValueChange={setMemberIds} />
        </Field>
      )}
      {error && !isDefinedError(error) && (
        <p role="alert" className="text-sm text-destructive-text">
          {error.message}
        </p>
      )}
      <Button type="submit" className="self-end" disabled={isPending}>
        {channel ? t('update', 'Update') : t('create', 'Create')}
      </Button>
    </form>
  );
};

/** Picks team members who aren't in the channel yet and adds them. */
const AddMembersForm = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const { closeMembers } = usePanel();
  const { data } = useChannel(channelId);
  const change = useChannelChange();
  const [userIds, setUserIds] = useState<string[]>([]);

  const add = useMutation(
    orpc.channels.addMembers.mutationOptions({
      ...change,
      onSuccess: async () => {
        await change.onSuccess();
        closeMembers();
      },
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <MemberPicker value={userIds} onValueChange={setUserIds} exclude={data?.memberIds} />
      <Button
        className="self-end"
        disabled={userIds.length === 0 || add.isPending}
        onClick={() => add.mutate({ id: channelId, userIds })}
      >
        {t('add-members', 'Add members')}
      </Button>
    </div>
  );
};

const EditChannel = ({ id }: { id: string }) => {
  const { data, error } = useChannel(id);

  if (error) return <p className="text-sm text-destructive-text">{error.message}</p>;

  return data ? <ChannelForm key={data.id} channel={data} /> : <Skeleton className="h-40" />;
};

/** The side panels the channel pages open: create, edit, and add members. */
export const ChannelPanels = () => {
  const { t } = useTranslation('frontline');
  const { channelId, membersOf, closeChannel, closeMembers } = usePanel();

  return (
    <>
      <SidePanel
        open={Boolean(channelId)}
        onClose={closeChannel}
        title={
          channelId === 'new'
            ? t('create-channel', 'Create channel')
            : t('edit-channel', 'Edit channel')
        }
        description={t('channel-hint', 'Name the channel. You become its admin.')}
      >
        {channelId === 'new' ? <ChannelForm /> : channelId && <EditChannel id={channelId} />}
      </SidePanel>
      <SidePanel
        open={Boolean(membersOf)}
        onClose={closeMembers}
        title={t('add-members', 'Add members')}
        description={t('add-members-hint', 'Pick the teammates who work this channel.')}
      >
        {membersOf && <AddMembersForm channelId={membersOf} />}
      </SidePanel>
    </>
  );
};
