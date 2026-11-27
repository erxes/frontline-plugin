import { useMutation } from '@tanstack/react-query';
import { ColorPicker, Form as FormRoot, Input, Select, Textarea, toast } from 'erxes-ui';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { LanguageSelect } from '@/knowledgebase/LanguageSelect.tsx';
import { orpc } from '~/orpc.ts';
import { ChannelSelect } from '~/shared/ChannelSelect.tsx';
import { DevicePreview } from '~/shared/DevicePreview.tsx';
import { ImageField } from '~/shared/Files.tsx';
import { SaveBar, SettingField, SettingsCard, SwitchField } from '~/shared/Settings.tsx';
import { FormScreens } from './FormScreens.tsx';
import {
  type Form,
  type FormField,
  LOAD_TYPES,
  type LoadType,
  useFormChange,
  useLoadTypeNames,
} from './useForms.ts';

/** A pick of how the embed opens. */
export const LoadTypeSelect = ({
  value,
  onChange,
  variant,
}: {
  value: LoadType;
  onChange: (loadType: LoadType) => void;
  variant?: 'flush';
}) => {
  const { t } = useTranslation('frontline');
  const loadTypes = useLoadTypeNames();

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const loadType = LOAD_TYPES.find((type) => type === next);

        if (loadType) onChange(loadType);
      }}
    >
      <Select.Trigger aria-label={t('form-load-type', 'Shows as')} variant={variant}>
        <Select.Value />
      </Select.Trigger>
      <Select.Content>
        {LOAD_TYPES.map((type) => (
          <Select.Item key={type} value={type}>
            {loadTypes[type]}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};

/** What the page's form edits: the form's words, look, callout and thank-you. */
type Values = Pick<
  Form,
  | 'channelId'
  | 'loadType'
  | 'saveAsCustomer'
  | 'calloutSkip'
  | 'calloutImage'
  | 'thankImage'
  | 'languageCode'
> & {
  name: string;
  title: string;
  description: string;
  buttonText: string;
  primaryColor: string;
  calloutTitle: string;
  calloutBody: string;
  calloutButtonText: string;
  thankTitle: string;
  thankContent: string;
};

const valuesOf = (form: Form): Values => ({
  name: form.name,
  channelId: form.channelId,
  title: form.title ?? '',
  description: form.description ?? '',
  buttonText: form.buttonText ?? '',
  loadType: form.loadType,
  primaryColor: form.primaryColor ?? '',
  languageCode: form.languageCode,
  saveAsCustomer: form.saveAsCustomer,
  calloutSkip: form.calloutSkip,
  calloutTitle: form.calloutTitle ?? '',
  calloutBody: form.calloutBody ?? '',
  calloutButtonText: form.calloutButtonText ?? '',
  calloutImage: form.calloutImage,
  thankTitle: form.thankTitle ?? '',
  thankContent: form.thankContent ?? '',
  thankImage: form.thankImage,
});

type TextKey = {
  [K in keyof Values]: Values[K] extends string ? K : never;
}[keyof Values];

/** A text setting; `long` makes it a full-width text box. */
const TextSetting = ({ name, label, long }: { name: TextKey; label: string; long?: boolean }) => (
  <SettingField<Values, TextKey> name={name} label={label} wide={long}>
    {(field) => (long ? <Textarea {...field} rows={3} /> : <Input {...field} />)}
  </SettingField>
);

/** A picture of the callout or the thank-you, uploaded through core's files. */
const ImageSetting = ({ name, label }: { name: 'calloutImage' | 'thankImage'; label: string }) => (
  <SettingField<Values, typeof name> name={name} label={label} wide bare>
    {(field) => <ImageField value={field.value?.url ?? ''} onChange={field.onChange} />}
  </SettingField>
);

/** What the team calls the form, where it lives, and what visitors read on it. */
const GeneralCard = () => {
  const { t } = useTranslation('frontline');

  return (
    <SettingsCard
      title={t('form', 'Form')}
      description={t('form-general-description', 'Its name and channel, and what visitors read.')}
    >
      <SettingField<Values, 'name'>
        name="name"
        label={t('name', 'Name')}
        required
        rules={{ validate: (name) => Boolean(name.trim()) || t('name-required', 'Enter a name') }}
      >
        {(field) => <Input {...field} maxLength={200} />}
      </SettingField>
      <SettingField<Values, 'channelId'> name="channelId" label={t('channel', 'Channel')} bare>
        {(field) => <ChannelSelect value={field.value} onChange={field.onChange} />}
      </SettingField>
      <TextSetting name="title" label={t('form-title', 'Form title')} />
      <TextSetting name="buttonText" label={t('form-button-text', 'Button text')} />
      <TextSetting name="description" label={t('description', 'Description')} long />
    </SettingsCard>
  );
};

/** How the embed opens and looks, and whether a sender becomes a customer or a lead. */
const AppearanceCard = () => {
  const { t } = useTranslation('frontline');

  return (
    <SettingsCard
      title={t('form-appearance', 'Appearance')}
      description={t('form-appearance-description', 'How it opens on a website, and its colour.')}
    >
      <SettingField<Values, 'loadType'> name="loadType" label={t('form-load-type', 'Shows as')}>
        {(field) => <LoadTypeSelect value={field.value} onChange={field.onChange} />}
      </SettingField>
      <SettingField<Values, 'languageCode'> name="languageCode" label={t('language', 'Language')}>
        {(field) => <LanguageSelect value={field.value} onChange={field.onChange} />}
      </SettingField>
      <SettingField<Values, 'primaryColor'> name="primaryColor" label={t('form-color', 'Colour')}>
        {(field) => (
          <ColorPicker
            aria-label={t('form-color', 'Colour')}
            value={field.value || undefined}
            onValueChange={field.onChange}
            className="w-16"
          />
        )}
      </SettingField>
      <SwitchField<Values>
        name="saveAsCustomer"
        label={t('form-save-as-customer', 'Save as customer')}
        hint={t(
          'form-save-as-customer-hint',
          'A sender becomes a customer; otherwise a lead until they are qualified.',
        )}
      />
    </SettingsCard>
  );
};

/** The callout a popup or shoutbox shows before the form, unless it is skipped. */
const CalloutCard = () => {
  const { t } = useTranslation('frontline');
  const skip = useWatch<Values, 'calloutSkip'>({ name: 'calloutSkip' });

  return (
    <SettingsCard
      title={t('form-callout', 'Callout')}
      description={t(
        'form-callout-description',
        'What a pop-up or shoutbox shows before the form opens.',
      )}
    >
      <SwitchField<Values>
        name="calloutSkip"
        label={t('form-callout-skip', 'Skip callout')}
        hint={t('form-callout-skip-hint', 'Open the form at once, with no callout first.')}
      />
      {!skip && (
        <>
          <TextSetting name="calloutTitle" label={t('form-callout-title', 'Callout title')} />
          <TextSetting
            name="calloutButtonText"
            label={t('form-callout-button', 'Callout button')}
          />
          <TextSetting name="calloutBody" label={t('form-callout-body', 'Callout text')} long />
          <ImageSetting name="calloutImage" label={t('form-callout-image', 'Callout image')} />
        </>
      )}
    </SettingsCard>
  );
};

/** What a visitor reads after sending the form. */
const ThankYouCard = () => {
  const { t } = useTranslation('frontline');

  return (
    <SettingsCard
      title={t('form-thank-you', 'Thank you')}
      description={t('form-thank-you-description', 'What a visitor reads after sending it.')}
    >
      <TextSetting name="thankTitle" label={t('form-thank-title', 'Thank-you title')} long />
      <TextSetting name="thankContent" label={t('form-thank-content', 'Thank-you text')} long />
      <ImageSetting name="thankImage" label={t('form-thank-image', 'Thank-you image')} />
    </SettingsCard>
  );
};

/** The form as visitors get it, with the changes not saved yet. */
const LivePreview = ({ form, fields }: { form: Form; fields: FormField[] }) => {
  const { primaryColor, ...values } = useWatch<Values>();

  // The pictures are whole files or none: one being uploaded shows once it is in.
  const [callout, thanks] = useWatch<Values, ['calloutImage', 'thankImage']>({
    name: ['calloutImage', 'thankImage'],
  });

  return (
    <div className="min-w-0 lg:sticky lg:top-0 lg:col-span-2 lg:self-start">
      <DevicePreview>
        <FormScreens
          form={{
            ...form,
            ...values,
            calloutImage: callout,
            thankImage: thanks,
            primaryColor: primaryColor || null,
          }}
          fields={fields}
        />
      </DevicePreview>
    </div>
  );
};

/**
 * The form's settings in one form with one Save, its cards beside a live preview that shows each
 * change before it is saved. Members who can't manage the form read them.
 */
export const FormSettings = ({ form, fields }: { form: Form; fields: FormField[] }) => {
  const { t } = useTranslation('frontline');
  const change = useFormChange();
  const values = useForm({ defaultValues: valuesOf(form) });

  const update = useMutation(
    orpc.forms.update.mutationOptions({
      ...change,
      onSuccess: (saved) => {
        values.reset(valuesOf(saved));
        change.onSuccess();
        toast({ title: t('form-saved', 'Form saved') });
      },
    }),
  );

  const save = values.handleSubmit((next) =>
    update.mutate({
      id: form.id,
      ...next,
      name: next.name.trim(),
      primaryColor: next.primaryColor || null,
    }),
  );

  return (
    <FormRoot {...values}>
      <form
        onSubmit={(event) => void save(event)}
        className="grid grid-cols-1 gap-4 lg:grid-cols-5"
      >
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-3">
          <fieldset disabled={!form.canManage} className="contents">
            <GeneralCard />
            <AppearanceCard />
            <CalloutCard />
            <ThankYouCard />
          </fieldset>
          {form.canManage && (
            <SaveBar
              dirty={values.formState.isDirty}
              saving={update.isPending}
              onDiscard={() => values.reset()}
            />
          )}
        </div>
        <LivePreview form={form} fields={fields} />
      </form>
    </FormRoot>
  );
};
