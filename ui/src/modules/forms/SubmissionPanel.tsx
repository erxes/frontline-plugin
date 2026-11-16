import { contactQueries } from '@erxes/core-contract/client';
import {
  IconCalendarPlus,
  IconDots,
  IconForms,
  IconMessage,
  IconTrash,
  IconUser,
} from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Button,
  ContactLink,
  PanelField,
  PanelSection,
  Skeleton,
  TextField,
  type TRecordSlotProps,
  useFormat,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { InfoRow, PanelSkeleton, PageLink, ReadOnly } from '~/shared/Panel.tsx';
import { ActionsMenu, useConfirmDelete } from '~/shared/Records.tsx';
import { useAnswerText } from './answers.ts';
import {
  type FormField,
  formPath,
  type Submission,
  useForm,
  useFormChange,
  useFormFields,
} from './useForms.ts';

const useSubmission = (id: string) =>
  useQuery(orpc.forms.submissions.get.queryOptions({ input: { id } }));

/** Asks for "delete" to be typed, then deletes the submissions with their answers. */
export const useDeleteSubmissions = () => {
  const { t } = useTranslation('frontline');
  const confirm = useConfirmDelete();
  const remove = useMutation(orpc.forms.submissions.remove.mutationOptions(useFormChange()));

  const deleteSubmissions = async (ids: string[], done?: () => void) => {
    await confirm(
      t('delete-submissions-confirm', {
        defaultValue_one: 'Delete this submission?',
        defaultValue_other: 'Delete {{count}} submissions?',
        count: ids.length,
      }),
    );
    remove.mutate({ ids }, { onSuccess: done });
  };

  return { deleteSubmissions, isPending: remove.isPending };
};

/** The panel header's title: when it was sent. */
export const SubmissionTitle = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const submission = useSubmission(contentId);

  if (submission.isPending) return <Skeleton className="h-4 w-32" />;

  return (
    <span className="truncate">
      {submission.data
        ? t('submission-of', 'Sent {{at}}', { at: format.dateTime(submission.data.createdAt) })
        : submission.error?.message}
    </span>
  );
};

/** The header's menu, for the form's admins: delete it. */
export const SubmissionActions = ({ contentId }: TRecordSlotProps) => {
  const { t } = useTranslation('frontline');
  const submission = useSubmission(contentId).data;
  const form = useForm(submission?.formId ?? '').data;
  const { deleteSubmissions } = useDeleteSubmissions();

  if (!submission || !form?.canManage) return null;

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('submission-menu', 'Submission actions')}>
          <IconDots />
        </Button>
      }
      actions={[
        {
          value: 'delete',
          icon: <IconTrash />,
          label: t('delete', 'Delete'),
          onSelect: () => void deleteSubmissions([submission.id]),
        },
      ]}
    />
  );
};

/** One answer, corrected in place: text and numbers as typed, other kinds as they were sent. */
const AnswerRow = ({ submission, field }: { submission: Submission; field: FormField }) => {
  const answerText = useAnswerText();
  const update = useMutation(orpc.forms.submissions.update.mutationOptions(useFormChange()));
  const value = submission.answers[field.id];
  const text = answerText(value);
  const typed = value === undefined || typeof value === 'string' || typeof value === 'number';

  return (
    <PanelField icon={IconMessage} label={field.label ?? ''} cell={typed}>
      {typed ? (
        <TextField
          scope={`frontline-submission.${submission.id}.${field.id}`}
          value={text}
          placeholder={field.label ?? ''}
          onSave={(next) => {
            const trimmed = next.trim();

            if (trimmed === text) return;

            const number = Number(trimmed);

            update.mutate({
              id: submission.id,
              fieldId: field.id,
              value: !trimmed
                ? null
                : field.type === 'number' && Number.isFinite(number)
                  ? number
                  : trimmed,
            });
          }}
        />
      ) : (
        <span className="px-2 text-xs">{text}</span>
      )}
    </PanelField>
  );
};

/** Answers to fields since removed from the form, as they were sent. */
const RemovedAnswers = ({
  submission,
  fields,
}: {
  submission: Submission;
  fields: FormField[];
}) => {
  const { t } = useTranslation('frontline');
  const answerText = useAnswerText();
  const known = new Set(fields.map((field) => field.id));
  const removed = Object.entries(submission.answers).filter(([fieldId]) => !known.has(fieldId));

  if (removed.length === 0) return null;

  return (
    <PanelSection title={t('submission-removed-fields', 'Removed fields')}>
      {removed.map(([fieldId, value]) => (
        <PanelField key={fieldId} icon={IconMessage} label={fieldId} cell={false}>
          <span className="px-2 text-xs">{answerText(value)}</span>
        </PanelField>
      ))}
    </PanelSection>
  );
};

const SubmissionFields = ({ submission }: { submission: Submission }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const form = useForm(submission.formId).data;
  const fields = useFormFields(submission.formId).data ?? [];

  return (
    <>
      <PanelSection title={t('submission', 'Submission')}>
        <PageLink
          to={formPath(submission.formId, 'submissions')}
          label={form?.name ?? '…'}
          count={<IconForms className="size-4" />}
        />
        <PanelField icon={IconUser} label={t('customer', 'Customer')} cell={false}>
          {submission.customerId && (
            <ContactLink
              contentType="core:customer"
              contentId={submission.customerId}
              contacts={contactQueries}
            />
          )}
        </PanelField>
        <InfoRow icon={IconCalendarPlus} label={t('submitted-at', 'Sent at')}>
          {format.dateTime(submission.createdAt)}
        </InfoRow>
      </PanelSection>
      <ReadOnly when={!form?.canManage}>
        <PanelSection title={t('submission-answers', 'Answers')}>
          {fields.map((field) => (
            <AnswerRow key={field.id} submission={submission} field={field} />
          ))}
        </PanelSection>
      </ReadOnly>
      <RemovedAnswers submission={submission} fields={fields} />
    </>
  );
};

/** The Detail tab: who sent it and when, and each answer. */
export const SubmissionDetail = ({ contentId }: TRecordSlotProps) => {
  const submission = useSubmission(contentId);

  if (submission.isPending) return <PanelSkeleton />;

  if (submission.isError)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {submission.error.message}
      </p>
    );

  return <SubmissionFields submission={submission.data} />;
};
