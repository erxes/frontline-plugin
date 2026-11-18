import { IconLayoutBottombar, IconLetterCase } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { PanelFormLayout, PanelFormRow, type TRecordDraftProps, textOf } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { ChannelRow, useManagedChannels } from '~/shared/ChannelSelect.tsx';
import { TextRow } from '~/shared/TextRow.tsx';
import { LoadTypeSelect } from './FormSettings.tsx';
import { type LoadType, useFormChange } from './useForms.ts';

/**
 * A new form in core's side panel: its channel, name, the title visitors read and how it shows.
 * Nothing saves until Save; the form then takes the draft's place, and its fields are built on
 * its Builder page.
 */
export const FormNew = ({ defaults, onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const first = useManagedChannels()[0]?.id ?? '';
  const [picked, setChannelId] = useState(() => textOf(defaults.channelId));
  const [loadType, setLoadType] = useState<LoadType>('embedded');
  const channelId = picked || first;
  const { onSuccess } = useFormChange();

  const create = useMutation(
    orpc.forms.create.mutationOptions({
      onSuccess: (form) => {
        onSuccess();
        onCreated(form.id);
      },
    }),
  );

  // onSubmit rather than a form action, which would clear the fields when the API refuses them.
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    create.mutate({
      channelId,
      loadType,
      name: textOf(form.get('name')),
      title: textOf(form.get('title')),
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={create.isPending}
        saveLabel={t('create-form', 'Create form')}
      >
        <ChannelRow
          value={channelId}
          onChange={setChannelId}
          missing={t('form-channel-first', 'Be an admin of a channel to add a form.')}
        />
        <TextRow
          label={t('name', 'Name')}
          icon={IconLetterCase}
          name="name"
          required
          placeholder={t('form-name-placeholder', 'Name the form for your team')}
        />
        <TextRow
          label={t('form-title', 'Form title')}
          icon={IconLetterCase}
          name="title"
          placeholder={t('form-title-placeholder', 'What visitors read above it')}
        />
        <PanelFormRow label={t('form-load-type', 'Shows as')} icon={IconLayoutBottombar}>
          <LoadTypeSelect value={loadType} onChange={setLoadType} />
        </PanelFormRow>
        {create.error && (
          <p role="alert" className="text-xs text-destructive-text">
            {create.error.message}
          </p>
        )}
      </PanelFormLayout>
    </form>
  );
};
