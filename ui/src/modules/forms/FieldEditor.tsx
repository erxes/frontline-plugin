import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconChevronDown, IconChevronRight, IconForms, IconTrash } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import {
  Button,
  cn,
  Collapsible,
  DragHandle,
  Input,
  Label,
  Select,
  StringArrayInput,
  Switch,
  TextField,
} from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { FieldRules } from './FieldRules.tsx';
import {
  FIELD_ICONS,
  FIELD_TYPES,
  PICK_TYPES,
  PRESETS,
  takesValidator,
  useFieldTypeName,
  usePresetNames,
} from './fieldTypes.ts';
import { type FormField, useFormChange } from './useForms.ts';

type Validator = FormField['validator'];

/** How the field's text answers are checked: not at all, by a preset, or by a pattern. */
const ValidatorSetting = ({
  validator,
  save,
}: {
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

          if (preset) save({ type: 'preset', preset });
          else if (next === 'custom') save({ type: 'custom', pattern: '.*' });
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
    </div>
  );
};

/** The settings a field folds open to: its help text, choices, validation and rules. */
const FieldSettings = ({ field, fields }: { field: FormField; fields: FormField[] }) => {
  const { t } = useTranslation('frontline');
  const update = useMutation(orpc.forms.fields.update.mutationOptions(useFormChange()));
  // Held here as typed, so an option entered before the last one's save returns isn't lost.
  const [options, setOptions] = useState(() => field.options);

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
      {PICK_TYPES.includes(field.type) && (
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
      )}
      {takesValidator(field) && (
        <ValidatorSetting validator={field.validator} save={(validator) => save({ validator })} />
      )}
      <div className="sm:col-span-2">
        <FieldRules field={field} fields={fields} save={save} />
      </div>
    </div>
  );
};

/** The end of a field's row: its type, whether it's required, and removing it. */
const FieldRowEnd = ({ field, canManage }: { field: FormField; canManage: boolean }) => {
  const { t } = useTranslation('frontline');
  const typeName = useFieldTypeName();
  const change = useFormChange();
  const update = useMutation(orpc.forms.fields.update.mutationOptions(change));
  const remove = useMutation(orpc.forms.fields.remove.mutationOptions(change));
  const requiredId = `frontline-field-${field.id}-required`;
  const known = FIELD_TYPES.find((type) => type === field.type);
  const TypeIcon = known ? FIELD_ICONS[known] : IconForms;

  return (
    <>
      <span className="flex w-36 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <TypeIcon className="size-4 shrink-0" />
        <span className="truncate">{typeName(field.type)}</span>
      </span>
      <div className="flex shrink-0 items-center gap-2">
        <Switch
          id={requiredId}
          checked={field.isRequired}
          onCheckedChange={(isRequired) => update.mutate({ id: field.id, isRequired })}
        />
        <Label htmlFor={requiredId}>{t('field-required', 'Required')}</Label>
      </div>
      {canManage && (
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('field-remove', 'Remove {{label}}', { label: field.label })}
          onClick={() => remove.mutate({ ids: [field.id] })}
        >
          <IconTrash />
        </Button>
      )}
    </>
  );
};

/**
 * One field of the builder, edited in place and dragged by its handle, within its step or to
 * another: its label and whether it's required in the row, the rest folded under it. Each change
 * saves as it's made.
 */
export const FieldEditor = ({
  field,
  fields,
  canManage,
}: {
  field: FormField;
  fields: FormField[];
  canManage: boolean;
}) => {
  const { t } = useTranslation('frontline');
  const [open, setOpen] = useState(false);
  const update = useMutation(orpc.forms.fields.update.mutationOptions(useFormChange()));

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: field.id,
    disabled: !canManage,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        '--sortable-transform': CSS.Translate.toString(transform),
        '--sortable-transition': transition,
      }}
      className={cn(
        'sortable rounded-lg border bg-background',
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-1 p-1.5">
          {canManage && (
            <DragHandle
              aria-label={t('field-move', 'Move {{label}}', { label: field.label })}
              {...attributes}
              {...listeners}
            />
          )}
          <Collapsible.Trigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label={t('field-settings', 'Settings of {{label}}', { label: field.label })}
              />
            }
          >
            {open ? <IconChevronDown /> : <IconChevronRight />}
          </Collapsible.Trigger>
          <span className="min-w-0 flex-1">
            <TextField
              scope={`frontline-field.${field.id}.label`}
              value={field.label ?? ''}
              placeholder={t('field-label', 'Label')}
              onSave={(label) => update.mutate({ id: field.id, label: label.trim() })}
            />
          </span>
          <FieldRowEnd field={field} canManage={canManage} />
        </div>
        <Collapsible.Panel>
          <FieldSettings field={field} fields={fields} />
        </Collapsible.Panel>
      </Collapsible>
    </div>
  );
};
