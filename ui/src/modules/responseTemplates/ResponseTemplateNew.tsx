import { IconAlignLeft, IconCircles, IconLetterCase } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { Editor, PanelFormLayout, PanelFormRow, Select, type TRecordDraftProps } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { textOf } from '~/shared/hooks.ts';
import { TextRow } from '~/shared/TextRow.tsx';
import { useManagedChannels, useTemplateChange } from './useResponseTemplates.ts';

/** The channel the list page passes the draft, or none for a draft opened without one. */
const channelOf = ({ channelId }: Record<string, unknown>) =>
  typeof channelId === 'string' ? channelId : '';

/**
 * A new template in core's side panel, under its "New response template" header: its channel,
 * name and content. Nothing saves until Save; the fields keep what was typed when the API
 * refuses it.
 */
export const ResponseTemplateNew = ({ defaults, onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  const channels = useManagedChannels();
  const [channelId, setChannelId] = useState(() => channelOf(defaults));
  const [content, setContent] = useState('');
  const { onSuccess } = useTemplateChange();

  const create = useMutation(
    orpc.responseTemplates.create.mutationOptions({
      onSuccess: async (template) => {
        await onSuccess();
        onCreated(template.id);
      },
    }),
  );

  const nameOf = (id: string) => channels.data?.find((channel) => channel.id === id)?.name ?? '';

  // onSubmit rather than a form action, which would clear the fields when the API refuses them.
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    create.mutate({ channelId, name: textOf(form.get('name')), content });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={create.isPending}
        saveLabel={t('create-response-template', 'Create response template')}
      >
        <PanelFormRow label={t('channel', 'Channel')} icon={IconCircles} required>
          <Select value={channelId} onValueChange={setChannelId}>
            <Select.Trigger variant="bordered" aria-label={t('channel', 'Channel')}>
              <Select.Value placeholder={t('pick-channel', 'Pick a channel')}>
                {(id: string) => nameOf(id)}
              </Select.Value>
            </Select.Trigger>
            <Select.Content>
              {(channels.data ?? []).map((channel) => (
                <Select.Item key={channel.id} value={channel.id}>
                  {channel.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </PanelFormRow>
        <TextRow
          label={t('name', 'Name')}
          icon={IconLetterCase}
          name="name"
          required
          placeholder={t('name', 'Name')}
        />
        <PanelFormRow label={t('content', 'Content')} icon={IconAlignLeft}>
          <Editor
            onChange={setContent}
            label={t('content', 'Content')}
            variant="outline"
            className="min-h-40"
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
