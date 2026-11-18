import { memberQueries } from '@erxes/core-contract/client';
import { isDefinedError } from '@orpc/client';
import { IconAlignLeft, IconIcons, IconLetterCase, IconUsers } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  EntityPicker,
  IconPicker,
  memberName,
  PanelFormLayout,
  PanelFormRow,
  type TRecordDraftProps,
} from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MemberLine } from '~/shared/Person.tsx';
import { orpc } from '~/orpc.ts';
import { textOf } from '~/shared/hooks.ts';
import { TextRow } from '~/shared/TextRow.tsx';
import { useChannelChange } from './useChannels.ts';

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

/**
 * A new channel in core's side panel, under its "New channel" header: icon, name, description
 * and its first members. Nothing saves until Save; CHANNEL_NAME_TAKEN shows under the name, and
 * the fields keep what was typed.
 */
export const ChannelNew = ({ onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const [icon, setIcon] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const { onSuccess } = useChannelChange();

  const create = useMutation(
    orpc.channels.create.mutationOptions({
      onSuccess: async (channel) => {
        await onSuccess();
        onCreated(channel.id);
      },
    }),
  );

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
            value={icon ?? undefined}
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
        <PanelFormRow label={t('members', 'Members')} icon={IconUsers}>
          <MemberPicker value={memberIds} onValueChange={setMemberIds} />
        </PanelFormRow>
        {create.error && !isDefinedError(create.error) && (
          <p role="alert" className="text-xs text-destructive-text">
            {create.error.message}
          </p>
        )}
      </PanelFormLayout>
    </form>
  );
};
