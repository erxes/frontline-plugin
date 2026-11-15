import { useMutation } from '@tanstack/react-query';
import { ColorPicker, Input, Textarea, toast } from 'erxes-ui';
import type { SubmitEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '../orpc.ts';
import { draftsOf, FormActions } from '../shared/Drafts.tsx';
import { Field, SidePanel } from '../shared/SidePanel.tsx';
import { type Status, usePipelineChange, useStages, useStatusPanel } from './queries.ts';

const useStatusDraft = draftsOf<{ name: string; description: string; color: string }>();

/** Shows a refused save as the old page did: "Update failed: <why>". */
const useStatusChange = () => {
  const { t } = useTranslation('frontline');
  const change = usePipelineChange();

  return {
    ...change,
    onError: (error: Error) =>
      toast({
        variant: 'destructive',
        title: t('update-failed', 'Update failed: {{message}}', { message: error.message }),
      }),
  };
};

/**
 * A new status at the end of stage `type`, or a change to `status`. Closing the
 * panel keeps the draft; saving clears it and closes the panel.
 */
const StatusForm = ({
  pipelineId,
  type,
  status,
}: {
  pipelineId: string;
  type: number;
  status?: Status;
}) => {
  const { t } = useTranslation('frontline');
  const { close } = useStatusPanel();
  const change = useStatusChange();

  const draft = useStatusDraft(status?.id ?? `new~${pipelineId}~${type}`, {
    name: status?.name ?? '',
    description: status?.description ?? '',
    color: status?.color ?? '',
  });

  const options = {
    ...change,
    onSuccess: async () => {
      draft.clear();
      close();
      await change.onSuccess();
    },
  };

  const create = useMutation(orpc.pipelines.statuses.create.mutationOptions(options));
  const update = useMutation(orpc.pipelines.statuses.update.mutationOptions(options));
  const { isPending } = status ? update : create;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const { color, ...fields } = draft.value;
    const input = { ...fields, color: color || undefined };

    if (status) update.mutate({ id: status.id, ...input });
    else create.mutate({ pipelineId, type, ...input });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field id="status-name" label={t('name', 'Name')}>
        <div className="flex gap-2">
          <ColorPicker
            aria-label={t('color', 'Color')}
            value={draft.value.color || undefined}
            onValueChange={(color) => draft.change({ color })}
          />
          <Input
            id="status-name"
            required
            value={draft.value.name}
            onChange={(event) => draft.change({ name: event.target.value })}
          />
        </div>
      </Field>
      <Field id="status-description" label={t('description', 'Description')}>
        <Textarea
          id="status-description"
          maxLength={255}
          value={draft.value.description}
          onChange={(event) => draft.change({ description: event.target.value })}
        />
      </Field>
      <FormActions
        dirty={draft.dirty}
        onDiscard={draft.clear}
        disabled={isPending}
        submit={status ? t('update', 'Update') : t('create', 'Create')}
      />
    </form>
  );
};

/** Adds a status to a stage, or edits one, beside the stages. */
export const StatusPanel = ({
  pipelineId,
  statuses,
}: {
  pipelineId: string;
  statuses: Status[];
}) => {
  const { t } = useTranslation('frontline');
  const stages = useStages();
  const { value, close } = useStatusPanel();
  const [key, newType] = value?.split('~') ?? [];
  const status = statuses.find((item) => item.id === key);
  const type = status?.type ?? Number(newType);
  const stage = stages.find((item) => item.type === type);
  const open = Boolean(status) || (key === 'new' && Boolean(stage));

  return (
    <SidePanel
      open={open}
      onClose={close}
      title={
        status
          ? t('edit-status', 'Edit status')
          : t('add-status-to', 'Add a status to {{stage}}', { stage: stage?.label })
      }
      description={t('status-hint', 'A step tickets pass through in this stage.')}
    >
      {open && <StatusForm key={value} pipelineId={pipelineId} type={type} status={status} />}
    </SidePanel>
  );
};
