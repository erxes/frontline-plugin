import { useMutation } from '@tanstack/react-query';
import { Input, Label, Select, StringArrayInput, Switch, TextField } from 'erxes-ui';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { FieldRules } from './FieldRules.tsx';
import { PICK_TYPES, PRESETS, SELECT_TYPES, takesValidator, usePresetNames } from './fieldTypes.ts';
import { type FormField, useFormChange } from './useForms.ts';

type Validator = FormField['validator'];

type Save = (change: Partial<Pick<FormField, 'column' | 'options' | 'allowSearch'>>) => void;

/**
 * How the field's text answers are checked: not at all, by a preset, or by a pattern, and what
 * the visitor reads when theirs fails.
 */
const ValidatorSetting = ({
  fieldId,
  validator,
  save,
}: {
  fieldId: string;
  validator: Validator;
  save: (validator: Validator) => void;
}) => {
  const { t } = useTranslation('frontline');
  const presets = usePresetNames();
  const picked = validator?.type === 'custom' ? 'custom' : (validator?.preset ?? 'none');

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('field-validation', 'Validation')}</Label>
      <Select
        value={picked}
        onValueChange={(next) => {
          const preset = PRESETS.find((each) => each === next);
          const message = validator?.message;

          if (preset) save({ type: 'preset', preset, message });
          else if (next === 'custom') save({ type: 'custom', pattern: '.*', message });
          else save(null);
        }}
      >
        <Select.Trigger aria-label={t('field-validation', 'Validation')}>
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="none">{t('field-validation-none', 'None')}</Select.Item>
          {PRESETS.map((preset) => (
            <Select.Item key={preset} value={preset}>
              {presets[preset]}
            </Select.Item>
          ))}
          <Select.Item value="custom">{t('field-validation-custom', 'Pattern')}</Select.Item>
        </Select.Content>
      </Select>
      {validator?.type === 'custom' && (
        <Input
          aria-label={t('field-pattern', 'Pattern')}
          defaultValue={validator.pattern}
          onBlur={(event) => {
            const pattern = event.currentTarget.value;

            if (pattern && pattern !== validator.pattern) save({ ...validator, pattern });
          }}
        />
      )}
      {validator && (
        <TextField
          scope={`frontline-field.${fieldId}.validator-message`}
          value={validator.message ?? ''}
          placeholder={t('field-validation-message', 'What the visitor reads when it fails')}
          onSave={(message) => save({ ...validator, message: message.trim() || undefined })}
        />
      )}
    </div>
  );
};

/** Whether the field takes the form's whole width or half, beside another half. */
const WidthSetting = ({ field, save }: { field: FormField; save: Save }) => {
  const { t } = useTranslation('frontline');

  return (
    <div className="flex flex-col gap-2">
      <Label>{t('field-width', 'Width')}</Label>
      <Select
        value={String(field.column)}
        onValueChange={(next) => save({ column: next === '1' ? 1 : 2 })}
      >
        <Select.Trigger aria-label={t('field-width', 'Width')}>
          <Select.Value />
        </Select.Trigger>
        <Select.Content>
          <Select.Item value="2">{t('field-width-full', 'Full width')}</Select.Item>
          <Select.Item value="1">{t('field-width-half', 'Half width')}</Select.Item>
        </Select.Content>
      </Select>
    </div>
  );
};

/** A pick field's options. */
const OptionsSetting = ({ field, save }: { field: FormField; save: Save }) => {
  const { t } = useTranslation('frontline');
  // Held here as typed, so an option entered before the last one's save returns isn't lost.
  const [options, setOptions] = useState(() => field.options);

  return (
    <div className="flex flex-col gap-2 sm:col-span-2">
      <Label>{t('field-options', 'Options')}</Label>
      <StringArrayInput
        value={options}
        onValueChange={(next) => {
          setOptions(next);
          save({ options: next });
        }}
        placeholder={t('field-add-option', 'Type an option and press Enter')}
      />
    </div>
  );
};

/** Whether visitors type to find a dropdown's option instead of opening its list. */
const SearchSetting = ({ field, save }: { field: FormField; save: Save }) => {
  const { t } = useTranslation('frontline');
  const searchId = useId();

  return (
    <div className="flex items-center gap-2 sm:col-span-2">
      <Switch
        id={searchId}
        checked={field.allowSearch}
        onCheckedChange={(allowSearch) => save({ allowSearch })}
      />
      <Label htmlFor={searchId}>{t('field-allow-search', 'Visitors type to find one')}</Label>
    </div>
  );
};

/** The settings a field folds open to: its help text, width, choices, validation and rules. */
export const FieldSettings = ({ field, fields }: { field: FormField; fields: FormField[] }) => {
  const { t } = useTranslation('frontline');
  const update = useMutation(orpc.forms.fields.update.mutationOptions(useFormChange()));

  const save = (change: Omit<Parameters<typeof update.mutate>[0], 'id'>) =>
    update.mutate({ id: field.id, ...change });

  return (
    <div className="grid grid-cols-1 gap-4 border-t p-3 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label>{t('description', 'Description')}</Label>
        <TextField
          scope={`frontline-field.${field.id}.description`}
          value={field.description ?? ''}
          placeholder={t('field-description-hint', 'Help text under the field')}
          onSave={(description) => save({ description: description.trim() })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>{t('field-placeholder', 'Placeholder')}</Label>
        <TextField
          scope={`frontline-field.${field.id}.placeholder`}
          value={field.placeholder ?? ''}
          placeholder={t('field-placeholder', 'Placeholder')}
          onSave={(placeholder) => save({ placeholder: placeholder.trim() })}
        />
      </div>
      <WidthSetting field={field} save={save} />
      {takesValidator(field) && (
        <ValidatorSetting
          fieldId={field.id}
          validator={field.validator}
          save={(validator) => save({ validator })}
        />
      )}
      {PICK_TYPES.includes(field.type) && <OptionsSetting field={field} save={save} />}
      {SELECT_TYPES.includes(field.type) && <SearchSetting field={field} save={save} />}
      <div className="sm:col-span-2">
        <FieldRules field={field} fields={fields} save={save} />
      </div>
    </div>
  );
};
