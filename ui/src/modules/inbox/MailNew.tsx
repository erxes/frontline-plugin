import { IconAt, IconLetterCase, IconMail, IconMessage } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { PanelFormLayout, PanelFormRow, Select, textOf, type TRecordDraftProps } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';
import { PickerField } from '~/shared/Pickers.tsx';
import { TextRow } from '~/shared/TextRow.tsx';
import { useInboxChange, useIntegrations } from './queries.ts';

const Email = z.email();

/** Core's customers with an address the search finds, and the search itself once it is one. */
const useRecipients = (search: string) => {
  const found = useQuery({
    ...orpc.integrations.mail.recipients.queryOptions({ input: { search } }),
    placeholderData: keepPreviousData,
  });

  const options = (found.data ?? []).map((row) => ({
    value: row.email,
    label: [row.firstName, row.lastName, `<${row.email}>`].filter(Boolean).join(' '),
  }));

  const typed = search.trim().toLowerCase();

  return {
    options:
      Email.safeParse(typed).success && !options.some((option) => option.value === typed)
        ? [{ value: typed, label: typed }, ...options]
        : options,
    loading: found.isPending,
    error: found.error,
  };
};

/** The mailbox a new mail goes from: one of the active mail integrations the member sees. */
const FromRow = ({
  value,
  onChange,
  mailboxes,
}: {
  value: string;
  onChange: (id: string) => void;
  mailboxes: { id: string; name: string }[];
}) => {
  const { t } = useTranslation('frontline');

  return (
    <PanelFormRow label={t('from', 'From')} icon={IconMail} required>
      <Select value={value} onValueChange={(next) => typeof next === 'string' && onChange(next)}>
        <Select.Trigger aria-label={t('from', 'From')}>
          <Select.Value placeholder={t('choose-mailbox', 'Choose a mailbox')} />
        </Select.Trigger>
        <Select.Content>
          {mailboxes.map((mailbox) => (
            <Select.Item key={mailbox.id} value={mailbox.id}>
              {mailbox.name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
    </PanelFormRow>
  );
};

/**
 * A new mail in core's side panel: from one of the channel mailboxes, to a customer core finds
 * or any address, with a subject and text. Its conversation takes the draft's place, and the
 * customer's reply joins it.
 */
export const MailNew = ({ onCreated, onCancel }: TRecordDraftProps) => {
  const { t } = useTranslation('frontline');

  const mailboxes = (useIntegrations().data ?? []).filter(
    (integration) => integration.kind === 'mail' && integration.isActive,
  );

  const [picked, setIntegrationId] = useState('');
  const integrationId = picked || mailboxes[0]?.id || '';
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const recipients = useRecipients(search);
  const { onSuccess } = useInboxChange();

  const compose = useMutation(
    orpc.integrations.mail.compose.mutationOptions({
      onSuccess: async ({ conversationId }) => {
        await onSuccess();
        onCreated(conversationId);
      },
    }),
  );

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    compose.mutate({
      integrationId,
      to,
      subject: textOf(form.get('subject')),
      content: textOf(form.get('content')),
    });
  };

  return (
    <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
      <PanelFormLayout onCancel={onCancel} saving={compose.isPending} saveLabel={t('send', 'Send')}>
        <FromRow value={integrationId} onChange={setIntegrationId} mailboxes={mailboxes} />
        <PanelFormRow label={t('to', 'To')} icon={IconAt} required>
          <PickerField
            label={t('to', 'To')}
            display={<span className="truncate">{to}</span>}
            placeholder={t('choose-recipient', 'A customer or an address')}
            options={recipients.options}
            value={to ? [to] : []}
            onValueChange={(emails) => setTo(emails[0] ?? '')}
            loading={recipients.loading}
            error={recipients.error}
            onSearchChange={setSearch}
          />
        </PanelFormRow>
        <TextRow label={t('subject', 'Subject')} icon={IconLetterCase} name="subject" required />
        <TextRow
          label={t('message', 'Message')}
          icon={IconMessage}
          name="content"
          required
          multiline
        />
        {compose.error && (
          <p role="alert" className="text-xs text-destructive-text">
            {compose.error.message}
          </p>
        )}
      </PanelFormLayout>
    </form>
  );
};
