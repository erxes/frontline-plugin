import { memberQueries } from '@erxes/core-contract/client';
import { CHANNEL_ICON } from '~/shared/icons.ts';
import { isDefinedError } from '@orpc/client';
import {
  IconAlignLeft,
  IconGitBranch,
  IconIcons,
  IconLetterCase,
  IconMessageCircle,
  IconUsers,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  EntityPicker,
  IconPicker,
  memberName,
  PanelFormLayout,
  PanelFormRow,
  Switch,
  type TRecordDraftProps,
  textOf,
  toast,
} from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { channelSettingsPath } from '~/shared/channelScope.ts';
import { MemberLine } from '~/shared/Person.tsx';
import { MembersField } from '~/shared/MemberPicker.tsx';
import { orpc } from '~/orpc.ts';
import { TextRow } from '~/shared/TextRow.tsx';
import { useChange } from '~/shared/hooks.ts';

/** Team members to pick, several at once, leaving out `exclude`. */
export const MemberPicker = ({
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
      renderItem={(member) => <MemberLine id={member.id} />}
      value={value}
      onValueChange={onValueChange}
      loading={team.isPending}
      error={team.error}
      searchPlaceholder={t('search-members', 'Search members')}
    />
  );
};

/** What a new channel starts with, beside itself. */
type Starters = { messenger: boolean; pipeline: boolean };

/**
 * Creates the channel, then what it starts with: a website messenger and a ticket pipeline, so
 * conversations can come in and turn into tickets from the start. The channel stands even when a
 * starter fails; the toast says which, and its tab adds it again.
 */
const useCreateChannel = (starters: Starters, onCreated: (id: string) => void) => {
  const { t } = useTranslation('frontline');

  const { onSuccess } = useChange(
    orpc.channels.key(),
    orpc.integrations.key(),
    orpc.pipelines.key(),
    orpc.conversations.counts.key(),
  );

  // Save stays busy until the starters are made too, as TanStack waits on `onSuccess`.
  const addStarters = async (channel: { id: string; name: string }) => {
    const results = await Promise.allSettled([
      starters.messenger &&
        orpc.integrations.create.call({
          channelId: channel.id,
          kind: 'messenger',
          name: channel.name,
          config: { welcome: '' },
        }),
      starters.pipeline &&
        orpc.pipelines.create.call({
          channelId: channel.id,
          name: t('starter-pipeline', 'Support'),
        }),
    ]);

    if (results.some((result) => result.status === 'rejected')) {
      toast({
        title: t('channel-starters-failed', 'The channel is made, but not all it starts with'),
        description: t(
          'channel-starters-failed-hint',
          'Add the messenger or pipeline from the channel’s tabs.',
        ),
        variant: 'destructive',
      });
    }
  };

  return useMutation(
    orpc.channels.create.mutationOptions({
      onSuccess: async (channel) => {
        await addStarters(channel);
        onSuccess();
        onCreated(channel.id);
      },
    }),
  );
};

/**
 * Opens a new channel on its own settings, at the integrations that bring its work in, closing
 * the draft it was made in.
 */
const useOpenChannel = (close: () => void) => {
  const navigate = useNavigate();

  return (id: string) => {
    close();
    void navigate(channelSettingsPath(id, 'integrations'));
  };
};

/** A starter the new channel can begin with, on until turned off. */
const StarterRow = ({
  label,
  hint,
  icon,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint: string;
  icon: typeof IconUsers;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) => (
  <PanelFormRow label={label} icon={icon} hint={hint}>
    <Switch
      aria-label={label}
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="mx-2"
    />
  </PanelFormRow>
);

/** The new channel's first members, as chips with an "Add" button that opens the team. */
const MembersRow = ({
  value,
  onValueChange,
}: {
  value: string[];
  onValueChange: (ids: string[]) => void;
}) => {
  const { t } = useTranslation('frontline');
  const label = t('members', 'Members');

  return (
    <PanelFormRow label={label} icon={IconUsers}>
      <MembersField label={label} value={value} onValueChange={onValueChange} />
    </PanelFormRow>
  );
};

/**
 * A new channel in core's side panel, under its "New channel" header: icon, name, description,
 * its first members, and what it starts with, a website messenger and a ticket pipeline. Nothing
 * saves until Save; CHANNEL_NAME_TAKEN shows under the name, and the fields keep what was typed.
 */
export const ChannelNew = ({ onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const [icon, setIcon] = useState<string | null>(CHANNEL_ICON);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [starters, setStarters] = useState<Starters>({ messenger: true, pipeline: true });
  const create = useCreateChannel(starters, useOpenChannel(onCancel));

  const takenName =
    isDefinedError(create.error) && create.error.code === 'CHANNEL_NAME_TAKEN'
      ? create.error.data.name
      : null;

  // onSubmit rather than a form action, which would clear the fields when the API refuses them.
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    create.mutate({
      name: textOf(form.get('name')),
      description: textOf(form.get('description')),
      icon,
      memberIds,
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={create.isPending}
        saveLabel={t('create-channel', 'Create channel')}
      >
        <PanelFormRow label={t('icon', 'Icon')} icon={IconIcons}>
          <IconPicker
            aria-label={t('icon', 'Icon')}
            value={icon ?? CHANNEL_ICON}
            onValueChange={setIcon}
            className="w-min"
          />
        </PanelFormRow>
        <TextRow
          label={t('name', 'Name')}
          icon={IconLetterCase}
          name="name"
          required
          error={
            takenName === null
              ? undefined
              : t('name-taken', 'Another channel is already called {{name}}.', { name: takenName })
          }
          placeholder={t('name', 'Name')}
        />
        <TextRow
          label={t('description', 'Description')}
          icon={IconAlignLeft}
          name="description"
          multiline
        />
        <MembersRow value={memberIds} onValueChange={setMemberIds} />
        <StarterRow
          label={t('website-messenger', 'Website messenger')}
          hint={t('starter-messenger-hint', 'A chat widget for your site, set up after Save')}
          icon={IconMessageCircle}
          checked={starters.messenger}
          onCheckedChange={(messenger) => setStarters((value) => ({ ...value, messenger }))}
        />
        <StarterRow
          label={t('ticket-pipeline', 'Ticket pipeline')}
          hint={t('starter-pipeline-hint', 'Support, with the default statuses')}
          icon={IconGitBranch}
          checked={starters.pipeline}
          onCheckedChange={(pipeline) => setStarters((value) => ({ ...value, pipeline }))}
        />
        {create.error && !isDefinedError(create.error) && (
          <p role="alert" className="text-xs text-destructive-text">
            {create.error.message}
          </p>
        )}
      </PanelFormLayout>
    </form>
  );
};
