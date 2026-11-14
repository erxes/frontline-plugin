import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Dialog, Editor, EntityPicker, Input, Label, Skeleton } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '../orpc.ts';
import { textOf } from '../shared/hooks.ts';
import { SidePanel } from '../shared/SidePanel.tsx';
import {
  type ResponseTemplate,
  useResponseTemplate,
  useTemplateChange,
  useTemplatePanel,
} from './useResponseTemplates.ts';

/** A new template in `channelId` (`template` undefined) or a change to one; saving closes the panel. */
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
  const [content, setContent] = useState(template?.content ?? '');

  const options = {
    ...change,
    onSuccess: async () => {
      await change.onSuccess();
      close();
    },
  };

  const create = useMutation(orpc.responseTemplates.create.mutationOptions(options));
  const update = useMutation(orpc.responseTemplates.update.mutationOptions(options));
  const { isPending } = template ? update : create;

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = textOf(new FormData(event.currentTarget).get('name'));

    if (template) update.mutate({ id: template.id, name, content });
    else create.mutate({ channelId, name, content });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="template-name">{t('name', 'Name')}</Label>
        <Input id="template-name" name="name" required defaultValue={template?.name} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium">{t('content', 'Content')}</span>
        <Editor
          initialContent={template?.content || undefined}
          onChange={setContent}
          label={t('content', 'Content')}
          variant="outline"
          className="min-h-60"
        />
      </div>
      <Button type="submit" className="self-end" disabled={isPending}>
        {template ? t('update', 'Update') : t('create', 'Create')}
      </Button>
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
