import { IconLayoutBottombar, IconLetterCase } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { PanelFormLayout, PanelFormRow, type TRecordDraftProps, textOf } from 'erxes-ui';
import type { SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';
import { ChannelRow, useNewRecordChannel } from '~/shared/ChannelSelect.tsx';
import { draftsOf, useDiscard, useDraft } from '~/shared/drafts.ts';
import { TextRow } from '~/shared/TextRow.tsx';
import { LoadTypeSelect } from './FormSettings.tsx';
import { formPath, LOAD_TYPES, useFormChange } from './useForms.ts';

/** The new form being set up, kept until it is created or thrown away. */
const formDrafts = draftsOf(
  'form',
  z.object({
    channelId: z.string(),
    name: z.string(),
    title: z.string(),
    loadType: z.enum(LOAD_TYPES),
  }),
);

/**
 * A new form in core's side panel: its channel, name, the title visitors read and how it shows.
 * Nothing saves until Save; the form then opens on its own page, at its fields.
 */
export const FormNew = ({ defaults, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();

  const draft = useDraft(formDrafts, 'new', {
    channelId: textOf(defaults.channelId),
    name: '',
    title: '',
    loadType: 'embedded',
  });

  const channelId = useNewRecordChannel(draft.value.channelId);
  const { onSuccess } = useFormChange();
  const discard = useDiscard(Boolean(draft.value.name || draft.value.title), draft.clear, onCancel);

  const create = useMutation(
    orpc.forms.create.mutationOptions({
      onSuccess: (form) => {
        draft.clear();
        onSuccess();
        void navigate(formPath(form.id));
      },
    }),
  );

  return (
    <form
      // onSubmit rather than a form action, which would clear the fields when the API refuses them.
      onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        create.mutate({ ...draft.value, channelId });
      }}
      // What is typed is kept as it is typed, so a closed panel or a reload loses none of it.
      onChange={(event) => {
        const form = new FormData(event.currentTarget);

        draft.save((current) => ({
          ...current,
          name: textOf(form.get('name')),
          title: textOf(form.get('title')),
        }));
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <PanelFormLayout
        onCancel={() => void discard()}
        saving={create.isPending}
        saveLabel={t('create-form', 'Create form')}
      >
        <ChannelRow
          value={channelId}
          onChange={(id) => draft.save((current) => ({ ...current, channelId: id }))}
          missing={t('form-channel-first', 'Be an admin of a channel to add a form.')}
        />
        <TextRow
          label={t('name', 'Name')}
          icon={IconLetterCase}
          name="name"
          required
          defaultValue={draft.value.name}
          placeholder={t('form-name-placeholder', 'Name the form for your team')}
        />
        <TextRow
          label={t('form-title', 'Form title')}
          icon={IconLetterCase}
          name="title"
          defaultValue={draft.value.title}
          placeholder={t('form-title-placeholder', 'What visitors read above it')}
        />
        <PanelFormRow label={t('form-load-type', 'Shows as')} icon={IconLayoutBottombar}>
          <LoadTypeSelect
            value={draft.value.loadType}
            onChange={(loadType) => draft.save((current) => ({ ...current, loadType }))}
          />
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
