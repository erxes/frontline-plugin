import { IconAlignLeft, IconCircles, IconLetterCase } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Input, PanelFormLayout, PanelFormRow, Textarea, type TRecordDraftProps } from 'erxes-ui';
import type { SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useChannel } from '@/channels/useChannels.ts';
import { orpc } from '~/orpc.ts';
import { textOf } from '~/shared/hooks.ts';
import { usePipelineChange } from './queries.ts';

/**
 * A new pipeline in core's side panel, under its "New pipeline" header, in the channel its
 * opener passed (`openNew(PIPELINE_TYPE, { channelId })`). It starts with one status per stage.
 * Nothing saves until Save, and a refusal keeps what was typed.
 */
export const PipelineNew = ({ defaults, onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const channelId = typeof defaults.channelId === 'string' ? defaults.channelId : '';
  const channel = useChannel(channelId);
  const { onSuccess } = usePipelineChange();

  const create = useMutation(
    orpc.pipelines.create.mutationOptions({
      onSuccess: async (pipeline) => {
        await onSuccess();
        onCreated(pipeline.id);
      },
    }),
  );

  // onSubmit rather than a form action, which would clear the fields when the API refuses them.
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    create.mutate({
      channelId,
      name: textOf(form.get('name')),
      description: textOf(form.get('description')),
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={create.isPending}
        saveLabel={t('create-pipeline', 'Create pipeline')}
      >
        <PanelFormRow label={t('channel', 'Channel')} icon={IconCircles}>
          <span className="flex h-8 items-center text-sm">
            {channel.data?.name ?? channel.error?.message}
          </span>
        </PanelFormRow>
        <PanelFormRow label={t('name', 'Name')} icon={IconLetterCase} required>
          <Input
            name="name"
            required
            aria-label={t('name', 'Name')}
            placeholder={t('name', 'Name')}
            variant="bordered"
            text="sm"
          />
        </PanelFormRow>
        <PanelFormRow label={t('description', 'Description')} icon={IconAlignLeft}>
          <Textarea name="description" aria-label={t('description', 'Description')} />
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
