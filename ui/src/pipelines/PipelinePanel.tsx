import { useMutation } from '@tanstack/react-query';
import { Input, Textarea, toast } from 'erxes-ui';
import type { SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { orpc } from '../orpc.ts';
import { draftsOf, FormActions } from '../shared/Drafts.tsx';
import { Field, SidePanel } from '../shared/SidePanel.tsx';
import { pipelinePath, usePipelineChange, usePipelinePanel } from './queries.ts';

const usePipelineDraft = draftsOf<{ name: string; description: string }>();

/** A new pipeline's name and description; closing the panel keeps the draft. */
const CreateForm = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const navigate = useNavigate();
  const change = usePipelineChange();
  const draft = usePipelineDraft(`new~${channelId}`, { name: '', description: '' });

  const create = useMutation(
    orpc.pipelines.create.mutationOptions({
      ...change,
      onSuccess: async (pipeline) => {
        draft.clear();
        toast({ title: t('pipeline-created', 'Pipeline created') });
        void navigate(pipelinePath(channelId, pipeline.id));
        await change.onSuccess();
      },
    }),
  );

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    create.mutate({ channelId, ...draft.value });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field id="pipeline-name" label={t('pipeline-name', 'Pipeline name')}>
        <Input
          id="pipeline-name"
          required
          value={draft.value.name}
          onChange={(event) => draft.change({ name: event.target.value })}
        />
      </Field>
      <Field id="pipeline-description" label={t('description', 'Description')}>
        <Textarea
          id="pipeline-description"
          value={draft.value.description}
          onChange={(event) => draft.change({ description: event.target.value })}
        />
      </Field>
      <FormActions
        dirty={draft.dirty}
        onDiscard={draft.clear}
        disabled={create.isPending}
        submit={t('create', 'Create')}
      />
    </form>
  );
};

/** Creates a pipeline in the channel the page shows, then opens it. */
export const PipelinePanel = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const { value, close } = usePipelinePanel();

  return (
    <SidePanel
      open={value === 'new'}
      onClose={close}
      title={t('create-pipeline', 'Create pipeline')}
      description={t('pipeline-hint', 'The statuses and rules a channel works its tickets by.')}
    >
      <CreateForm channelId={channelId} />
    </SidePanel>
  );
};
