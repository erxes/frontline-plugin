import { IconCircles, IconLetterCase, IconMessage } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Input,
  PanelFormLayout,
  PanelFormRow,
  Select,
  Textarea,
  type TRecordDraftProps,
} from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { textOf } from '~/shared/hooks.ts';
import { useIntegrationChange } from './queries.ts';

/**
 * A new website messenger in core's side panel: the channel its conversations land in, its name
 * and the welcome its visitors see. Only the channels the member is an admin of are offered.
 */
export const IntegrationNew = ({ onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');

  const channels = (
    useQuery(orpc.channels.list.queryOptions({ input: {} })).data?.channels ?? []
  ).filter((channel) => channel.canManage);

  const [channelId, setChannelId] = useState('');
  const { onSuccess } = useIntegrationChange();

  const create = useMutation(
    orpc.integrations.create.mutationOptions({
      onSuccess: async (integration) => {
        await onSuccess();
        onCreated(integration.id);
      },
    }),
  );

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    create.mutate({
      channelId,
      kind: 'messenger',
      name: textOf(form.get('name')),
      config: { welcome: textOf(form.get('welcome')) },
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={create.isPending}
        saveLabel={t('add-messenger', 'Add messenger')}
      >
        <PanelFormRow label={t('channel', 'Channel')} icon={IconCircles} required>
          <Select value={channelId} onValueChange={(next) => next && setChannelId(next)}>
            <Select.Trigger aria-label={t('channel', 'Channel')}>
              <Select.Value placeholder={t('channel', 'Channel')} />
            </Select.Trigger>
            <Select.Content>
              {channels.map((channel) => (
                <Select.Item key={channel.id} value={channel.id}>
                  {channel.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </PanelFormRow>
        <PanelFormRow label={t('name', 'Name')} icon={IconLetterCase} required>
          <Input
            name="name"
            required
            aria-label={t('name', 'Name')}
            placeholder={t('messenger-name-placeholder', 'Website')}
            variant="bordered"
            text="sm"
          />
        </PanelFormRow>
        <PanelFormRow label={t('welcome-message', 'Welcome message')} icon={IconMessage}>
          <Textarea name="welcome" aria-label={t('welcome-message', 'Welcome message')} />
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
