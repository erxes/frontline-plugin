import { IconLetterCase, IconMessage } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { PanelFormLayout, type TRecordDraftProps, textOf } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { messengerPath } from '@/messenger/queries.ts';
import { orpc } from '~/orpc.ts';
import { ChannelRow, useNewRecordChannel } from '~/shared/ChannelSelect.tsx';
import { TextRow } from '~/shared/TextRow.tsx';
import { useIntegrationChange } from './queries.ts';

/**
 * A new website messenger in core's side panel: the channel its conversations land in, its name
 * and the welcome its visitors see. Opened with a connected account's `kind` and `accountId`, or
 * a Facebook page's or Instagram account's `connectionId`, it
 * adds that page, bot or mailbox to the channel instead. Only the channels the member is an
 * admin of are offered; a `channelId` picks one. A new messenger opens on its settings page, where
 * its look and install code are.
 */
export const IntegrationNew = ({ defaults, onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');
  // A connected page or account's list opens the draft with its kind and id.
  const kind = textOf(defaults.kind) || 'messenger';
  const accountId = textOf(defaults.accountId);
  const connectionId = textOf(defaults.connectionId);
  const through = accountId ? { accountId } : connectionId ? { connectionId } : null;

  // A channel's page opens it with that channel picked.
  const [picked, setChannelId] = useState(() => textOf(defaults.channelId));
  const channelId = useNewRecordChannel(picked);
  const { onSuccess } = useIntegrationChange();
  const navigate = useNavigate();

  const create = useMutation(
    orpc.integrations.create.mutationOptions({
      onSuccess: (integration) => {
        onSuccess();
        onCreated(integration.id);

        if (integration.kind === 'messenger') void navigate(messengerPath(integration.id));
      },
    }),
  );

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    create.mutate({
      channelId,
      kind,
      name: textOf(form.get('name')),
      config: through ?? { welcome: textOf(form.get('welcome')) },
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout
        onCancel={onCancel}
        saving={create.isPending}
        saveLabel={
          through ? t('add-to-channel', 'Add to a channel') : t('add-messenger', 'Add messenger')
        }
      >
        <ChannelRow
          value={channelId}
          onChange={setChannelId}
          missing={t('messenger-channel-first', 'Be an admin of a channel to add a messenger.')}
        />
        <TextRow
          label={t('name', 'Name')}
          icon={IconLetterCase}
          name="name"
          required
          placeholder={t('messenger-name-placeholder', 'Website')}
          defaultValue={textOf(defaults.name)}
        />
        {!through && (
          <TextRow
            label={t('welcome-message', 'Welcome message')}
            icon={IconMessage}
            name="welcome"
            multiline
          />
        )}
        {create.error && (
          <p role="alert" className="text-xs text-destructive-text">
            {create.error.message}
          </p>
        )}
      </PanelFormLayout>
    </form>
  );
};
