import { IconCalendarPlus, IconMessage, IconSend, IconTrash, IconUser } from '@tabler/icons-react';
import {
  Button,
  ListFilter,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  type TListFilterField,
  useFormat,
  useOpenRecord,
  ViewBar,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { FORM_SUBMISSION_TYPE } from '~/plugin.ts';
import { ListEmpty, ListError } from '~/shared/List.tsx';
import { ContactChip } from '~/shared/Person.tsx';
import { DeleteButton, RowActions, SelectionBar, TextCell } from '~/shared/Records.tsx';
import { column as columnOf, PagedRows } from '~/shared/Table.tsx';
import { useAnswerText } from './answers.ts';
import { useDeleteSubmissions } from './SubmissionPanel.tsx';
import { type Form, type FormField, type Submission, useSubmissions } from './useForms.ts';

const LIST = 'frontline-form-submissions';

const column = columnOf<Submission>;

/** When it was sent, which opens it in core's side panel. */
const SentAt = ({ submission }: { submission: Submission }) => {
  const format = useFormat();
  const { open } = useOpenRecord();

  return (
    <Button
      variant="ghost"
      className="min-w-0 justify-start"
      onClick={() => open({ contentType: FORM_SUBMISSION_TYPE, contentId: submission.id })}
    >
      <span className="truncate">{format.dateTime(submission.createdAt)}</span>
    </Button>
  );
};

const MoreCell = ({ submission, manage }: { submission: Submission; manage: boolean }) => {
  const { t } = useTranslation('frontline');
  const { open } = useOpenRecord();
  const { deleteSubmissions } = useDeleteSubmissions();

  return (
    <RowActions
      label={t('submission-menu', 'Submission actions')}
      actions={[
        {
          value: 'open',
          icon: <IconSend />,
          label: t('open', 'Open'),
          onSelect: () => open({ contentType: FORM_SUBMISSION_TYPE, contentId: submission.id }),
        },
        ...(manage
          ? [
              {
                value: 'delete',
                icon: <IconTrash />,
                label: t('delete', 'Delete'),
                onSelect: () => void deleteSubmissions([submission.id]),
              },
            ]
          : []),
      ]}
    />
  );
};

/** A column for when it came, who sent it, then one per field of the form. */
const useColumns = (fields: FormField[], manage: boolean): RecordTableColumnDef<Submission>[] => {
  const { t } = useTranslation('frontline');
  const answerText = useAnswerText();

  return [
    {
      id: 'more',
      header: () => <RecordTable.ColumnSelector />,
      cell: ({ row }) => <MoreCell submission={row.original} manage={manage} />,
      size: 33,
    },
    ...(manage ? [RecordTable.checkboxColumnOf<Submission>()] : []),
    column('createdAt', t('submitted-at', 'Sent at'), IconCalendarPlus, 180, (submission) => (
      <RecordTableInlineCell>
        <SentAt submission={submission} />
      </RecordTableInlineCell>
    )),
    column('customer', t('customer', 'Customer'), IconUser, 200, (submission) => (
      <RecordTableInlineCell>
        {submission.customerId && <ContactChip contentId={submission.customerId} />}
      </RecordTableInlineCell>
    )),
    ...fields.map((field) =>
      column(field.id, field.label ?? '', IconMessage, 200, (submission) => (
        <TextCell value={answerText(submission.answers[field.id])} />
      )),
    ),
  ];
};

/** What the filter bar offers: when it came, and each field's answer. */
const useFields = (fields: FormField[]): TListFilterField[] => {
  const { t } = useTranslation('frontline');

  return [
    {
      path: 'subject.createdAt',
      label: t('submitted-at', 'Sent at'),
      type: 'date',
      icon: IconCalendarPlus,
    },
    ...fields.map((field) => ({
      path: `subject.answer.${field.id}`,
      label: field.label ?? '',
      type: 'text' as const,
      icon: IconMessage,
    })),
  ];
};

/**
 * A form's submissions under core's list bar, newest first and a page at a time, with a column
 * and a filter per field. A submission opens in core's side panel, where its answers are corrected.
 */
export const FormSubmissions = ({ form, fields }: { form: Form; fields: FormField[] }) => {
  const { t } = useTranslation('frontline');
  const manage = form.canManage;
  const { deleteSubmissions, isPending: deleting } = useDeleteSubmissions();

  const list = useSubmissions(form.id);
  const { rows: submissions, totalCount, isPending, error } = list;

  const columns = useColumns(fields, manage);

  return (
    <>
      <ViewBar allLabel={t('all-submissions', 'All submissions')}>
        <ListFilter id={LIST} fields={useFields(fields)} totalCount={totalCount} />
      </ViewBar>
      {error ? (
        <ListError error={error} />
      ) : !isPending && submissions.length === 0 ? (
        <ListEmpty
          icon={<IconSend />}
          title={t('no-submissions-yet', 'No submissions yet')}
          description={t(
            'no-submissions-description',
            'What visitors send through this form shows here.',
          )}
        />
      ) : (
        <RecordTable.Provider
          tableId="frontline_form_submissions"
          columns={columns}
          data={submissions}
          stickyColumns={['more', 'checkbox', 'createdAt']}
          className="m-3"
        >
          <PagedRows paging={list} count={submissions.length} />
          {manage && (
            <SelectionBar>
              {(selected, clear) => (
                <DeleteButton
                  disabled={deleting}
                  onClick={() => void deleteSubmissions(selected, clear)}
                />
              )}
            </SelectionBar>
          )}
        </RecordTable.Provider>
      )}
    </>
  );
};
