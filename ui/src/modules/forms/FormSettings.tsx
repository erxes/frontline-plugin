import {
  IconAlignLeft,
  IconCircles,
  IconClick,
  IconColorSwatch,
  IconEyeOff,
  IconHeartHandshake,
  IconLayoutBottombar,
  IconLetterCase,
  IconMessage,
  IconUserCheck,
} from '@tabler/icons-react';
import { ColorPicker, PanelField, PanelSection, Select, Switch, TextField } from 'erxes-ui';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ChannelSelect } from '~/shared/ChannelSelect.tsx';
import { type Form, LOAD_TYPES, type LoadType, useEditForm, useLoadTypeNames } from './useForms.ts';

type TextKey =
  | 'name'
  | 'title'
  | 'description'
  | 'buttonText'
  | 'calloutTitle'
  | 'calloutBody'
  | 'calloutButtonText'
  | 'thankTitle'
  | 'thankContent';

/** One text setting, saved when it loses focus; the name can't be left empty. */
const TextSetting = ({
  form,
  name,
  label,
  icon,
}: {
  form: Form;
  name: TextKey;
  label: string;
  icon: ComponentProps<typeof PanelField>['icon'];
}) => {
  const edit = useEditForm(form.id);
  const value = form[name] ?? '';

  return (
    <PanelField icon={icon} label={label}>
      <TextField
        scope={`frontline-form.${form.id}.${name}`}
        value={value}
        placeholder={label}
        onSave={(text) => {
          const next = text.trim();

          if (next !== value && (next || name !== 'name')) edit({ [name]: next });
        }}
      />
    </PanelField>
  );
};

/** What the team calls the form, where it lives, and what visitors read on it. */
export const General = ({ form }: { form: Form }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditForm(form.id);

  return (
    <PanelSection title={t('form', 'Form')}>
      <TextSetting form={form} name="name" label={t('name', 'Name')} icon={IconLetterCase} />
      <PanelField icon={IconCircles} label={t('channel', 'Channel')}>
        <ChannelSelect value={form.channelId} onChange={(channelId) => edit({ channelId })} />
      </PanelField>
      <TextSetting
        form={form}
        name="title"
        label={t('form-title', 'Form title')}
        icon={IconLetterCase}
      />
      <TextSetting
        form={form}
        name="description"
        label={t('description', 'Description')}
        icon={IconAlignLeft}
      />
      <TextSetting
        form={form}
        name="buttonText"
        label={t('form-button-text', 'Button text')}
        icon={IconClick}
      />
    </PanelSection>
  );
};

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

/** How the embed opens and looks, and whether a sender becomes a customer or a lead. */
export const Appearance = ({ form }: { form: Form }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditForm(form.id);

  return (
    <PanelSection title={t('form-appearance', 'Appearance')}>
      <PanelField icon={IconLayoutBottombar} label={t('form-load-type', 'Shows as')}>
        <LoadTypeSelect
          value={form.loadType}
          onChange={(loadType) => edit({ loadType })}
          variant="flush"
        />
      </PanelField>
      <PanelField icon={IconColorSwatch} label={t('form-color', 'Colour')} cell={false}>
        <ColorPicker
          aria-label={t('form-color', 'Colour')}
          value={form.primaryColor ?? ''}
          onValueChange={(primaryColor) => edit({ primaryColor: primaryColor || null })}
          className="mx-2 w-12"
        />
      </PanelField>
      <PanelField
        icon={IconUserCheck}
        label={t('form-save-as-customer', 'Save as customer')}
        cell={false}
      >
        <Switch
          aria-label={t('form-save-as-customer', 'Save as customer')}
          checked={form.saveAsCustomer}
          onCheckedChange={(saveAsCustomer) => edit({ saveAsCustomer })}
          className="mx-2"
        />
      </PanelField>
    </PanelSection>
  );
};

/** The callout a popup or shoutbox shows before the form, unless it is skipped. */
export const Callout = ({ form }: { form: Form }) => {
  const { t } = useTranslation('frontline');
  const edit = useEditForm(form.id);

  return (
    <PanelSection title={t('form-callout', 'Callout')}>
      <PanelField icon={IconEyeOff} label={t('form-callout-skip', 'Skip callout')} cell={false}>
        <Switch
          aria-label={t('form-callout-skip', 'Skip callout')}
          checked={form.calloutSkip}
          onCheckedChange={(calloutSkip) => edit({ calloutSkip })}
          className="mx-2"
        />
      </PanelField>
      {!form.calloutSkip && (
        <>
          <TextSetting
            form={form}
            name="calloutTitle"
            label={t('form-callout-title', 'Callout title')}
            icon={IconLetterCase}
          />
          <TextSetting
            form={form}
            name="calloutBody"
            label={t('form-callout-body', 'Callout text')}
            icon={IconMessage}
          />
          <TextSetting
            form={form}
            name="calloutButtonText"
            label={t('form-callout-button', 'Callout button')}
            icon={IconClick}
          />
        </>
      )}
    </PanelSection>
  );
};

/** What a visitor reads after sending the form. */
export const ThankYou = ({ form }: { form: Form }) => {
  const { t } = useTranslation('frontline');

  return (
    <PanelSection title={t('form-thank-you', 'Thank you')}>
      <TextSetting
        form={form}
        name="thankTitle"
        label={t('form-thank-title', 'Thank-you title')}
        icon={IconHeartHandshake}
      />
      <TextSetting
        form={form}
        name="thankContent"
        label={t('form-thank-content', 'Thank-you text')}
        icon={IconMessage}
      />
    </PanelSection>
  );
};
