import {
  IconActivity,
  IconDots,
  IconForms,
  IconLayoutList,
  IconSend,
  IconSettings,
  IconCode,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Button, CopyText, Label, RecordTimeline, Skeleton } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { ChannelLabel } from '~/shared/ChannelSelect.tsx';
import { AppHeader } from '~/shared/Header.tsx';
import { InstallCode, scriptTag } from '~/shared/InstallCode.tsx';
import { ActionsMenu } from '~/shared/Records.tsx';
import {
  RecordWorkspace,
  WorkspaceHead,
  WorkspaceNav,
  type WorkspaceSection,
} from '~/shared/RecordWorkspace.tsx';
import { SettingsCard } from '~/shared/Settings.tsx';
import { FormBuilder } from './FormBuilder.tsx';
import { StatusBadge, useFormActions } from './FormCells.tsx';
import { FormSettings } from './FormSettings.tsx';
import { FormSubmissions } from './FormSubmissions.tsx';
import {
  type Form,
  type FormField,
  FORM_SECTIONS,
  type FormSection,
  FORMS_PATH,
  formPath,
  type LoadType,
  useForm,
  useFormFields,
  useLoadTypeNames,
} from './useForms.ts';

/** The sections' names, icons and counts, in the member's language. */
const useSections = (id: string, form: Form | undefined, fields: number | undefined) => {
  const { t } = useTranslation('frontline');
  const to = (section: FormSection) => formPath(id, section);

  return {
    builder: {
      to: to('builder'),
      label: t('form-fields', 'Fields'),
      icon: IconLayoutList,
      count: fields,
    },
    settings: { to: to('settings'), label: t('settings', 'Settings'), icon: IconSettings },
    install: { to: to('install'), label: t('form-install', 'Install'), icon: IconCode },
    submissions: {
      to: to('submissions'),
      label: t('form-submissions', 'Submissions'),
      icon: IconSend,
      count: form?.submissionCount,
    },
    activity: { to: to('activity'), label: t('activity', 'Activity'), icon: IconActivity },
  } satisfies Record<FormSection, WorkspaceSection>;
};

/** The column's foot: how many saw the form, and how many contacts it brought. */
const Stats = ({ form }: { form: Form }) => {
  const { t } = useTranslation('frontline');

  return (
    <dl className="grid grid-cols-2 gap-2 border-t px-4 py-3 text-xs">
      <div>
        <dt className="text-muted-foreground">{t('form-views', 'Views')}</dt>
        <dd className="text-sm font-medium tabular-nums">{form.viewCount}</dd>
      </div>
      <div>
        <dt className="text-muted-foreground">{t('form-contacts', 'Contacts')}</dt>
        <dd className="text-sm font-medium tabular-nums">{form.contactsGathered}</dd>
      </div>
    </dl>
  );
};

/**
 * What a website pastes to show the form: an embedded form's slot, a pop-up's button, then the
 * script. The other load types open by themselves or with their own launcher.
 */
const installCode = (loadType: LoadType, code: string, scriptUrl: string) => {
  const script = scriptTag(scriptUrl);

  if (loadType === 'embedded') return `<div data-frontline-form="${code}"></div>\n${script}`;

  if (loadType === 'popup')
    return `<button type="button" data-frontline-form-open="${code}">Open form</button>\n${script}`;

  return script;
};

/** The form's public address and the code a website pastes, made the first time asked for. */
const Install = ({ form }: { form: Form }) => {
  const { t } = useTranslation('frontline');
  const loadTypes = useLoadTypeNames();
  const embed = useQuery(orpc.forms.embed.queryOptions({ input: { id: form.id } }));

  if (embed.error)
    return (
      <p role="alert" className="text-sm text-destructive-text">
        {embed.error.message}
      </p>
    );

  if (!embed.data) return <Skeleton className="h-48 w-full" />;

  return (
    <>
      <SettingsCard
        title={t('form-embed-url', 'Embed address')}
        description={t(
          'form-embed-url-description',
          'The form on a page of its own, to share as a link.',
        )}
      >
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
          <Label>{t('form-address', 'Address')}</Label>
          <CopyText value={embed.data.url}>
            <span className="text-sm break-all">{embed.data.url}</span>
          </CopyText>
        </div>
      </SettingsCard>
      <SettingsCard
        title={t('form-install-code', 'Install code')}
        description={t('form-install-description', {
          defaultValue: 'Paste it where the form should show. It opens as: {{loadType}}.',
          loadType: loadTypes[form.loadType],
        })}
      >
        <div className="min-w-0 sm:col-span-2">
          <InstallCode
            code={installCode(form.loadType, embed.data.code, embed.data.scriptUrl)}
            label={t('form-install-code', 'Install code')}
          />
        </div>
      </SettingsCard>
    </>
  );
};

const Section = ({
  section,
  form,
  fields,
}: {
  section: FormSection;
  form: Form;
  fields: FormField[];
}) => {
  switch (section) {
    case 'settings':
      return <FormSettings key={form.id} form={form} fields={fields} />;
    case 'install':
      return <Install form={form} />;
    case 'submissions':
      return <FormSubmissions form={form} fields={fields} />;
    case 'activity':
      // Core's timeline of the form: its notes, and what changed, from its events.
      return <RecordTimeline type={`${PLUGIN}.form`} id={form.id} />;
    default:
      return <FormBuilder form={form} fields={fields} />;
  }
};

const WIDTH = {
  builder: 'wide',
  settings: 'wide',
  install: 'settings',
  submissions: 'flush',
  activity: 'settings',
} as const;

/** The header's menu: duplicate, archive or reactivate, and delete, for the channel's admins. */
const FormMenu = ({ form }: { form: Form }) => {
  const { t } = useTranslation('frontline');

  const actions = useFormActions(form).filter(
    (action) => !FORM_SECTIONS.some((section) => section === action.value),
  );

  if (actions.length === 0) return null;

  return (
    <ActionsMenu
      trigger={
        <Button variant="outline" size="icon" aria-label={t('form-menu', 'Form actions')}>
          <IconDots />
        </Button>
      }
      actions={actions}
    />
  );
};

/**
 * A form on a page of its own: its sections in a column (Fields, Settings, Install,
 * Submissions, Activity) beside the open one. Fields and Settings each show the form as visitors get it.
 */
export const FormPage = () => {
  const { t } = useTranslation('frontline');
  const { id = '', section: param } = useParams();
  const section = FORM_SECTIONS.find((one) => one === param) ?? 'builder';
  const form = useForm(id);
  const fields = useFormFields(id);
  const sections = useSections(id, form.data, fields.data?.length);
  const loaded = form.data && fields.data ? { form: form.data, fields: fields.data } : undefined;

  return (
    <RecordWorkspace
      header={
        <AppHeader
          icon={IconForms}
          app={{ label: t('forms', 'Forms'), to: FORMS_PATH }}
          levels={[
            { label: form.data?.name ?? '…', to: formPath(id) },
            { label: sections[section].label },
          ]}
        >
          {form.data && <FormMenu form={form.data} />}
        </AppHeader>
      }
      error={form.error ?? fields.error}
      retry={() => {
        void form.refetch();
        void fields.refetch();
      }}
      width={WIDTH[section]}
      nav={
        loaded && (
          <WorkspaceNav
            label={t('form-sections', 'Form')}
            head={
              <WorkspaceHead
                to={formPath(id)}
                mark={<IconForms />}
                title={loaded.form.name}
                subtitle={undefined}
                badges={
                  <>
                    <StatusBadge status={loaded.form.status} />
                    <span className="text-xs text-muted-foreground">
                      <ChannelLabel id={loaded.form.channelId} />
                    </span>
                  </>
                }
              />
            }
            sections={FORM_SECTIONS.map((one) => sections[one])}
            foot={<Stats form={loaded.form} />}
          />
        )
      }
    >
      {loaded && <Section section={section} form={loaded.form} fields={loaded.fields} />}
    </RecordWorkspace>
  );
};
