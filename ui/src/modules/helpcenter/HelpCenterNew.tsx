import { IconAlignLeft, IconBook, IconLetterCase } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { PanelFormLayout, PanelFormRow, type TRecordDraftProps } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { textOf } from '~/shared/hooks.ts';
import { TextRow } from '~/shared/TextRow.tsx';
import { PickerField } from '~/shared/Pickers.tsx';
import { useHelpCenterChange, useTopicOptions } from './queries.ts';

/** A new help center in core's side panel: its title, description and topic. */
export const HelpCenterNew = ({ onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const topics = useTopicOptions();
  const [kbTopicId, setTopicId] = useState<string | null>(null);
  const { onSuccess } = useHelpCenterChange();

  const create = useMutation(
    orpc.helpCenters.create.mutationOptions({
      onSuccess: (center) => {
        onSuccess();
        onCreated(center.id);
      },
    }),
  );

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    create.mutate({
      title: textOf(form.get('title')).trim(),
      description: textOf(form.get('description')).trim() || null,
      kbTopicId,
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={create.isPending}
        saveLabel={t('create-help-center', 'Create help center')}
      >
        <TextRow label={t('title', 'Title')} icon={IconLetterCase} name="title" required />
        <TextRow label={t('description', 'Description')} icon={IconAlignLeft} name="description" />
        <PanelFormRow label={t('kb-topic', 'Knowledge base topic')} icon={IconBook}>
          <PickerField
            label={t('kb-topic', 'Knowledge base topic')}
            placeholder={t('none', 'None')}
            display={
              <span className="truncate">
                {topics.find((topic) => topic.value === kbTopicId)?.label}
              </span>
            }
            options={topics}
            value={kbTopicId ? [kbTopicId] : []}
            onValueChange={([id]) => setTopicId(id ?? null)}
            noneLabel={t('none', 'None')}
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
