import { useMutation, useQuery } from '@tanstack/react-query';
import { Dialog, Editor, EntityPicker, Input, Skeleton } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '../orpc.ts';
import { draftsOf, FormActions } from '../shared/Drafts.tsx';
import { Field, SidePanel } from '../shared/SidePanel.tsx';
import {
  type ResponseTemplate,
  useResponseTemplate,
  useTemplateChange,
  useTemplatePanel,
} from './useResponseTemplates.ts';

const useTemplateDraft = draftsOf<{ name: string; content: string }>();

/**
 * A new template in `channelId` (`template` undefined) or a change to one.
 * Closing the panel keeps the draft; saving clears it and closes the panel.
 */
const TemplateForm = ({
  channelId,
  template,
}: {
  channelId: string;
  template?: ResponseTemplate;
}) => {
  const { t } = useTranslation('frontline');
  const { close } = useTemplatePanel();
  const change = useTemplateChange();

  const draft = useTemplateDraft(template?.id ?? `new~${channelId}`, {
    name: template?.name ?? '',
    content: template?.content ?? '',
  });

  // The editor reads its content once, so a discard mounts a fresh one.
  const [revision, setRevision] = useState(0);

  const options = {
    ...change,
    onSuccess: async () => {
      draft.clear();
      await change.onSuccess();
      close();
    },
  };

  const create = useMutation(orpc.responseTemplates.create.mutationOptions(options));
  const update = useMutation(orpc.responseTemplates.update.mutationOptions(options));
  const { isPending } = template ? update : create;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (template) update.mutate({ id: template.id, ...draft.value });
    else create.mutate({ channelId, ...draft.value });
  };

  const discard = () => {
    draft.clear();
    setRevision((current) => current + 1);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field id="template-name" label={t('name', 'Name')}>
        <Input
          id="template-name"
          required
          value={draft.value.name}
          onChange={(event) => draft.change({ name: event.target.value })}
        />
      </Field>
      <Field label={t('content', 'Content')}>
        <Editor
          key={revision}
          initialContent={draft.value.content || undefined}
          onChange={(content) => draft.change({ content })}
          label={t('content', 'Content')}
          variant="outline"
          className="min-h-60"
        />
      </Field>
      <FormActions
        dirty={draft.dirty}
        onDiscard={discard}
        disabled={isPending}
        submit={template ? t('update', 'Update') : t('create', 'Create')}
      />
    </form>
  );
};

const EditTemplate = ({ id }: { id: string }) => {
  const { data, error } = useResponseTemplate(id);

  if (error) return <p className="text-sm text-destructive-text">{error.message}</p>;

  return data ? (
    <TemplateForm key={data.id} channelId={data.channelId} template={data} />
  ) : (
    <Skeleton className="h-60" />
  );
};

/** Create and edit beside the list, for the channel the page shows. */
export const ResponseTemplatePanel = ({ channelId }: { channelId: string }) => {
  const { t } = useTranslation('frontline');
  const { value, close } = useTemplatePanel();

  return (
    <SidePanel
      open={Boolean(value)}
      onClose={close}
      title={
        value === 'new'
          ? t('create-response-template', 'Create response template')
          : t('edit-response-template', 'Edit response template')
      }
      description={t('response-template-hint', 'A reply agents insert into conversations.')}
    >
      {value === 'new' ? (
        <TemplateForm channelId={channelId} />
      ) : (
        value && <EditTemplate id={value} />
      )}
    </SidePanel>
  );
};

/** Moves a template to another channel the member is an admin of. */
export const MoveTemplateDialog = ({
  template,
  onClose,
}: {
  template: ResponseTemplate;
  onClose: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const channels = useQuery(orpc.channels.list.queryOptions({ input: {} }));
  const move = useMutation(orpc.responseTemplates.update.mutationOptions(useTemplateChange()));

  const targets = (channels.data?.channels ?? []).filter(
    (channel) => channel.canManage && channel.id !== template.channelId,
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Content>
        <Dialog.Header>
          <Dialog.Title>{t('move-to-channel', 'Move to channel')}</Dialog.Title>
          <Dialog.Description>
            {t('move-template-hint', 'Pick the channel {{name}} moves to.', {
              name: template.name,
            })}
          </Dialog.Description>
        </Dialog.Header>
        <EntityPicker
          items={targets}
          itemKey={(channel) => ({ id: channel.id, label: channel.name })}
          value={[]}
          onValueChange={([channelId]) =>
            channelId && move.mutate({ id: template.id, channelId }, { onSuccess: onClose })
          }
          loading={channels.isPending}
          error={channels.error}
          searchPlaceholder={t('search-channels', 'Search channels')}
        />
      </Dialog.Content>
    </Dialog>
  );
};
