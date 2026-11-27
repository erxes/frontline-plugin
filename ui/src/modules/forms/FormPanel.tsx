import {
  IconAddressBook,
  IconCalendarPlus,
  IconCalendarUp,
  IconDots,
  IconEye,
  IconProgressCheck,
  IconUser,
} from '@tabler/icons-react';
import {
  Button,
  PanelField,
  PanelSection,
  Skeleton,
  type TRecordSlotProps,
  useFormat,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { InfoRow, PanelSkeleton, PageLink } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { StatusBadge, useFormActions } from './FormCells.tsx';
import { type Form, formPath, useForm, useFormFields } from './useForms.ts';
import { MemberChip } from '~/shared/Person.tsx';

/** The panel header's title: the form's name. */
export const FormTitle = ({ contentId }: TRecordSlotProps) => {
  const form = useForm(contentId);

  if (form.isPending) return <Skeleton className="h-4 w-32" />;

  return <span className="truncate">{form.data?.name ?? form.error?.message}</span>;
};

const FormMenu = ({ form }: { form: Form }) => {
  const { t } = useTranslation('frontline');

  return (
    <ActionsMenu
      trigger={
        <Button variant="ghost" size="icon" aria-label={t('form-menu', 'Form actions')}>
          <IconDots />
        </Button>
      }
      actions={useFormActions(form)}
    />
  );
};

/** The header's menu: the builder and submissions, and for admins duplicate, archive and delete. */
export const FormActions = ({ contentId }: TRecordSlotProps) => {
  const form = useForm(contentId).data;

  return form ? <FormMenu form={form} /> : null;
};

/** The form's page sections, with how many fields and submissions, and its counts and history. */
const Overview = ({ form }: { form: Form }) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const fields = useFormFields(form.id).data;

  const at = (label: string, icon: typeof IconCalendarPlus, date: Date) => (
    <InfoRow icon={icon} label={label}>
      {format.dateTime(date)}
    </InfoRow>
  );

  return (
    <PanelSection title={t('form-overview', 'Overview')}>
      <PageLink
        to={formPath(form.id)}
        label={t('form-fields', 'Fields')}
        count={fields?.length ?? '…'}
      />
      <PageLink to={formPath(form.id, 'settings')} label={t('settings', 'Settings')} count="" />
      <PageLink to={formPath(form.id, 'install')} label={t('form-install', 'Install')} count="" />
      <PageLink
        to={formPath(form.id, 'submissions')}
        label={t('form-submissions', 'Submissions')}
        count={form.submissionCount}
      />
      <PanelField icon={IconProgressCheck} label={t('status', 'Status')} cell={false}>
        <span className="px-2">
          <StatusBadge status={form.status} />
        </span>
      </PanelField>
      <InfoRow icon={IconEye} label={t('form-views', 'Views')}>
        {form.viewCount}
      </InfoRow>
      <InfoRow icon={IconAddressBook} label={t('form-contacts', 'Contacts')}>
        {form.contactsGathered}
      </InfoRow>
      <InfoRow icon={IconUser} label={t('created-by', 'Created by')}>
        <MemberChip id={form.createdBy} />
      </InfoRow>
      {at(t('created-at', 'Created at'), IconCalendarPlus, form.createdAt)}
      {at(t('updated-at', 'Updated at'), IconCalendarUp, form.updatedAt)}
    </PanelSection>
  );
};

/** The Detail tab: the form at a glance; its own page sets it up. */
export const FormDetail = ({ contentId }: TRecordSlotProps) => {
  const form = useForm(contentId);

  if (form.isPending) return <PanelSkeleton />;

  if (form.isError)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {form.error.message}
      </p>
    );

  return <Overview form={form.data} />;
};
