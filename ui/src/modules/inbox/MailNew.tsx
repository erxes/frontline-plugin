import { IconAt, IconLetterCase, IconMail, IconMessage } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { PanelFormLayout, PanelFormRow, Select, textOf, type TRecordDraftProps } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';
import { useDebounce } from 'use-debounce';
import { draftsOf, useDraft } from '~/shared/drafts.ts';
import { PickerField, SEARCH_PAUSE_MS } from '~/shared/Pickers.tsx';
import { TextRow } from '~/shared/TextRow.tsx';
import { useIntegrations } from './queries.ts';
import { useInboxChange } from './changes.ts';

const Email = z.email();

/**
 * Core's customers with an address the search finds, asked for once typing pauses, and the
 * search itself once it is one.
 */
const useRecipients = (search: string) => {
  const [asked] = useDebounce(search, SEARCH_PAUSE_MS);

  const found = useQuery({
    ...orpc.integrations.mail.recipients.queryOptions({ input: { search: asked } }),
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

/** The address a new mail goes to: a customer core finds, or the address typed. */
const ToRow = ({ value, onChange }: { value: string; onChange: (email: string) => void }) => {
  const { t } = useTranslation('frontline');
  const [search, setSearch] = useState('');
  const recipients = useRecipients(search);

  return (
    <PanelFormRow label={t('to', 'To')} icon={IconAt} required>
      <PickerField
        label={t('to', 'To')}
        display={<span className="truncate">{value}</span>}
        placeholder={t('choose-recipient', 'A customer or an address')}
        options={recipients.options}
        value={value ? [value] : []}
        onValueChange={(emails) => onChange(emails[0] ?? '')}
        loading={recipients.loading}
        error={recipients.error}
        onSearchChange={setSearch}
      />
    </PanelFormRow>
  );
};

/** The new mail being written, kept until it is sent, as the old new-email form kept it. */
const mailDrafts = draftsOf(
  'mail',
  z.object({ integrationId: z.string(), to: z.string(), subject: z.string(), content: z.string() }),
);

const NO_MAIL = { integrationId: '', to: '', subject: '', content: '' };

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

  const draft = useDraft(mailDrafts, 'new', NO_MAIL);
  const integrationId = draft.value.integrationId || mailboxes[0]?.id || '';
  const { onSuccess } = useInboxChange();

  const compose = useMutation(
    orpc.integrations.mail.compose.mutationOptions({
      onSuccess: ({ conversationId }) => {
        draft.clear();
        onSuccess();
        onCreated(conversationId);
      },
    }),
  );

  return (
    <form
      onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
        event.preventDefault();
        compose.mutate({ ...draft.value, integrationId });
      }}
      // What is typed is kept as it is typed, so a closed panel or a reload loses none of it.
      onChange={(event) => {
        const form = new FormData(event.currentTarget);

        draft.save((current) => ({
          ...current,
          subject: textOf(form.get('subject')),
          content: textOf(form.get('content')),
        }));
      }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <PanelFormLayout onCancel={onCancel} saving={compose.isPending} saveLabel={t('send', 'Send')}>
        <FromRow
          value={integrationId}
          onChange={(id) => draft.save((current) => ({ ...current, integrationId: id }))}
          mailboxes={mailboxes}
        />
        <ToRow
          value={draft.value.to}
          onChange={(to) => draft.save((current) => ({ ...current, to }))}
        />
        <TextRow
          label={t('subject', 'Subject')}
          icon={IconLetterCase}
          name="subject"
          defaultValue={draft.value.subject}
          required
        />
        <TextRow
          label={t('message', 'Message')}
          icon={IconMessage}
          name="content"
          defaultValue={draft.value.content}
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
