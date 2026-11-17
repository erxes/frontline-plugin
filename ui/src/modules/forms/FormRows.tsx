import { memberQueries } from '@erxes/core-contract/client';
import {
  IconAddressBook,
  IconCalendarUp,
  IconCircles,
  IconDots,
  IconEye,
  IconLetterCase,
  IconProgressCheck,
  IconSend,
  IconTag,
  IconUser,
} from '@tabler/icons-react';
import {
  Button,
  MemberInline,
  RecordList,
  type RecordListGroup,
  RecordTable,
  type RecordTableColumnDef,
  RecordTableInlineCell,
  RelativeDateDisplay,
} from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useChannelNames } from '~/shared/ChannelSelect.tsx';
import { ActionsMenu, RowActions, TextCell } from '~/shared/Records.tsx';
import { column as columnOf, DateCell, PagedRows } from '~/shared/Table.tsx';
import { FormName, StatusBadge, useFormActions } from './FormCells.tsx';
import { FORM_STATUSES, type Form, formTags, useEditForm, useStatusNames } from './useForms.ts';
import { MemberLine } from '~/shared/MemberLine.tsx';
import { TagBadges, TagsField } from '~/shared/Pickers.tsx';

const RowMenu = ({ form }: { form: Form }) => {
  const { t } = useTranslation('frontline');

  return (
    <ActionsMenu
      trigger={
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('form-actions', 'Actions for {{name}}', { name: form.name })}
        >
          <IconDots />
        </Button>
      }
      actions={useFormActions(form)}
    />
  );
};

/** One form: its name, channel, how many sent it, its author, when it changed, and its menu. */
const FormRow = ({ form, channel }: { form: Form; channel: string }) => {
  const { t } = useTranslation('frontline');

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 text-xs">
      <span className="flex min-w-0 flex-1">
        <FormName form={form} />
      </span>
      <span className="hidden w-36 shrink-0 truncate text-muted-foreground md:block">
        {channel}
      </span>
      <span className="w-28 shrink-0 text-muted-foreground">
        {t('form-submission-count', {
          defaultValue: '{{count}} sent',
          count: form.submissionCount,
        })}
      </span>
      <span className="hidden w-36 shrink-0 md:block">
        <MemberLine id={form.createdBy} />
      </span>
      <span className="w-24 shrink-0 text-muted-foreground">
        <RelativeDateDisplay value={form.updatedAt.toISOString()}>
          <RelativeDateDisplay.Value value={form.updatedAt.toISOString()} />
        </RelativeDateDisplay>
      </span>
      <RowMenu form={form} />
    </div>
  );
};

/**
 * The forms grouped by status, active first, each group under a header that folds it away.
 * Inside `RecordList.Provider`, whose selection the bulk bar reads.
 */
export const FormList = ({ forms }: { forms: Form[] }) => {
  const statuses = useStatusNames();
  const channels = useChannelNames();
  const byStatus = Map.groupBy(forms, (form) => form.status);

  const groups: RecordListGroup<Form>[] = FORM_STATUSES.flatMap((status) => {
    const rows = byStatus.get(status) ?? [];

    return rows.length === 0 ? [] : [{ id: status, label: statuses[status], rows }];
  });

  return (
    <RecordList
      groups={groups}
      rowId={(form) => form.id}
      rowLabel={(form) => form.name}
      renderRow={(form) => <FormRow form={form} channel={channels.get(form.channelId) ?? ''} />}
    />
  );
};

const column = columnOf<Form>;

const MoreCell = ({ form }: { form: Form }) => {
  const { t } = useTranslation('frontline');

  return (
    <RowActions
      label={t('form-actions', 'Actions for {{name}}', { name: form.name })}
      actions={useFormActions(form)}
    />
  );
};

/** The form's tags, picked in place by a member who may change it. */
const TagsCell = ({ form }: { form: Form }) => {
  const edit = useEditForm(form.id);

  if (!form.canManage) return <TagBadges tags={formTags} tagIds={form.tagIds} />;

  return <TagsField tags={formTags} value={form.tagIds} onChange={(tagIds) => edit({ tagIds })} />;
};

const useColumns = (manage: boolean): RecordTableColumnDef<Form>[] => {
  const { t } = useTranslation('frontline');
  const channels = useChannelNames();

  return [
    {
      id: 'more',
      header: () => <RecordTable.ColumnSelector />,
      cell: ({ row }) => <MoreCell form={row.original} />,
      size: 33,
    },
    ...(manage ? [RecordTable.checkboxColumnOf<Form>()] : []),
    column('name', t('name', 'Name'), IconLetterCase, 260, (form) => (
      <RecordTableInlineCell>
        <FormName form={form} />
      </RecordTableInlineCell>
    )),
    column('status', t('status', 'Status'), IconProgressCheck, 120, (form) => (
      <RecordTableInlineCell>
        <StatusBadge status={form.status} />
      </RecordTableInlineCell>
    )),
    column('channel', t('channel', 'Channel'), IconCircles, 180, (form) => (
      <TextCell value={channels.get(form.channelId) ?? null} />
    )),
    column('tagIds', t('tags', 'Tags'), IconTag, 200, (form) => <TagsCell form={form} />),
    column('title', t('form-title', 'Form title'), IconLetterCase, 220, (form) => (
      <TextCell value={form.title} />
    )),
    column('submissionCount', t('form-submissions', 'Submissions'), IconSend, 120, (form) => (
      <RecordTableInlineCell>{form.submissionCount}</RecordTableInlineCell>
    )),
    column('viewCount', t('form-views', 'Views'), IconEye, 100, (form) => (
      <RecordTableInlineCell>{form.viewCount}</RecordTableInlineCell>
    )),
    column('contactsGathered', t('form-contacts', 'Contacts'), IconAddressBook, 110, (form) => (
      <RecordTableInlineCell>{form.contactsGathered}</RecordTableInlineCell>
    )),
    column('createdBy', t('created-by', 'Created by'), IconUser, 200, (form) => (
      <RecordTableInlineCell>
        <MemberInline memberId={form.createdBy} members={memberQueries} />
      </RecordTableInlineCell>
    )),
    column('updatedAt', t('updated-at', 'Updated at'), IconCalendarUp, 140, (form) => (
      <DateCell date={form.updatedAt} />
    )),
  ];
};

/** The forms as a table, a page at a time. */
export const FormsTable = ({
  forms,
  manage,
  isPending,
  hasNextPage,
  fetchNextPage,
  children,
}: {
  forms: Form[];
  /** Whether rows can be picked for the bulk bar (`children`). */
  manage: boolean;
  isPending: boolean;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  children: ReactNode;
}) => (
  <RecordTable.Provider
    tableId="frontline_forms"
    columns={useColumns(manage)}
    data={forms}
    stickyColumns={['more', 'checkbox', 'name']}
    className="m-3"
  >
    <PagedRows
      isPending={isPending}
      hasNextPage={hasNextPage}
      count={forms.length}
      fetchNextPage={fetchNextPage}
    />
    {children}
  </RecordTable.Provider>
);
