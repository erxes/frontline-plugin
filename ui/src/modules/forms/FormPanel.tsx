import {
  IconAddressBook,
  IconCalendarPlus,
  IconCalendarUp,
  IconCode,
  IconDots,
  IconEye,
  IconProgressCheck,
  IconUser,
} from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  CopyText,
  PanelField,
  PanelSection,
  Skeleton,
  type TRecordSlotProps,
  useFormat,
} from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { InfoRow, PanelSkeleton, PageLink, ReadOnly } from '~/shared/Panel.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import { StatusBadge, useFormActions } from './FormCells.tsx';
import { Appearance, Callout, General, ThankYou } from './FormSettings.tsx';
import { type Form, formPath, type LoadType, useForm, useFormFields } from './useForms.ts';
import { MemberChip } from '~/shared/MemberLine.tsx';

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

/**
 * What a website pastes to show the form: an embedded form's slot, a pop-up's button, then the
 * script. The other load types open by themselves or with their own launcher.
 */
const installCode = (loadType: LoadType, code: string, scriptUrl: string) => {
  const script = `<script type="module" src="${scriptUrl}"></script>`;

  if (loadType === 'embedded') return `<div data-frontline-form="${code}"></div>\n${script}`;

  if (loadType === 'popup')
    return `<button type="button" data-frontline-form-open="${code}">Open form</button>\n${script}`;

  return script;
};

/** The form's install code and public address, made the first time they are asked for. */
const Embed = ({ form }: { form: Form }) => {
  const { t } = useTranslation('frontline');
  const embed = useMutation(orpc.forms.embed.mutationOptions());

  if (!embed.data)
    return (
      <PanelField icon={IconCode} label={t('form-install', 'Install')} cell={false}>
        <Button
          variant="ghost"
          size="sm"
          disabled={embed.isPending}
          onClick={() => embed.mutate({ id: form.id })}
        >
          {t('form-show-install', 'Show install code')}
        </Button>
      </PanelField>
    );

  const snippet = installCode(form.loadType, embed.data.code, embed.data.scriptUrl);

  return (
    <>
      <div className="px-2 py-1">
        <CopyText value={snippet}>
          <code
            aria-label={t('form-install-code', 'Install code')}
            className="block rounded-md bg-muted p-3 font-mono text-xs break-all whitespace-pre-wrap"
          >
            {snippet}
          </code>
        </CopyText>
      </div>
      <PanelField icon={IconCode} label={t('form-embed-url', 'Embed address')} cell={false}>
        <span className="min-w-0 truncate px-2 text-xs">
          <CopyText value={embed.data.url}>{embed.data.url}</CopyText>
        </span>
      </PanelField>
    </>
  );
};

/** The form's pages, its embed, counts and history. */
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
        to={formPath(form.id, 'builder')}
        label={t('form-fields', 'Fields')}
        count={fields?.length ?? '…'}
      />
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
      <Embed form={form} />
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

/** The Detail tab: the form's settings, each saved as soon as it changes, then its overview. */
export const FormDetail = ({ contentId }: TRecordSlotProps) => {
  const form = useForm(contentId);

  if (form.isPending) return <PanelSkeleton />;

  if (form.isError)
    return (
      <p role="alert" className="p-3 text-xs text-destructive-text">
        {form.error.message}
      </p>
    );

  return (
    <>
      <Overview form={form.data} />
      <ReadOnly when={!form.data.canManage}>
        <General form={form.data} />
        <Appearance form={form.data} />
        <Callout form={form.data} />
        <ThankYou form={form.data} />
      </ReadOnly>
    </>
  );
};
