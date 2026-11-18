import type { InferClientOutputs } from '@orpc/client';
import { IconPlus } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { Button, Input, Select, StringArrayInput, Switch } from 'erxes-ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { orpc } from '~/orpc.ts';
import { FormSheet } from '~/shared/FormSheet.tsx';
import { textOf } from '~/shared/hooks.ts';
import { SheetField, useSettingsChange } from './Settings.tsx';

export type Property = InferClientOutputs<Client>['tickets']['properties']['get'];

type PropertyType = Property['type'];

export const TYPES: PropertyType[] = [
  'text',
  'textarea',
  'number',
  'date',
  'select',
  'multiselect',
  'boolean',
];

export const hasChoices = (type: PropertyType) => type === 'select' || type === 'multiselect';

export const useTypeNames = (): Record<PropertyType, string> => {
  const { t } = useTranslation('frontline');

  return {
    text: t('property-text', 'Text'),
    textarea: t('property-textarea', 'Long text'),
    number: t('property-number', 'Number'),
    date: t('property-date', 'Date'),
    select: t('property-select', 'One choice'),
    multiselect: t('property-multiselect', 'Several choices'),
    boolean: t('property-boolean', 'Yes or no'),
  };
};

/** Add property: a sheet with its label, type, choices and whether new tickets must fill it. */
export const AddProperty = () => {
  const { t } = useTranslation('frontline');
  const names = useTypeNames();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<PropertyType>('text');
  const [options, setOptions] = useState<string[]>([]);
  const [isRequired, setRequired] = useState(false);
  const { onSuccess, onError } = useSettingsChange();

  const create = useMutation(
    orpc.tickets.properties.create.mutationOptions({
      onSuccess: () => {
        onSuccess();
        setOpen(false);
      },
      onError,
    }),
  );

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <IconPlus />
        {t('add-property', 'Add property')}
      </Button>
      <FormSheet
        open={open}
        onOpenChange={setOpen}
        title={t('add-ticket-property', 'Add ticket property')}
        submitting={create.isPending}
        error={create.error}
        onSubmit={(form) =>
          create.mutate({ label: textOf(form.get('label')).trim(), type, options, isRequired })
        }
      >
        <SheetField label={t('label', 'Label')}>
          <Input name="label" required aria-label={t('label', 'Label')} />
        </SheetField>
        <SheetField label={t('type', 'Type')}>
          <Select
            value={type}
            onValueChange={(next) => next && setType(TYPES.find((row) => row === next) ?? 'text')}
          >
            <Select.Trigger aria-label={t('type', 'Type')}>
              <Select.Value>{names[type]}</Select.Value>
            </Select.Trigger>
            <Select.Content>
              {TYPES.map((row) => (
                <Select.Item key={row} value={row}>
                  {names[row]}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        </SheetField>
        {hasChoices(type) && (
          <SheetField label={t('choices', 'Choices')}>
            <StringArrayInput
              value={options}
              onValueChange={setOptions}
              placeholder={t('add-choice', 'Add a choice')}
            />
          </SheetField>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={isRequired} onCheckedChange={setRequired} />
          {t('property-required-hint', 'Required: every new ticket fills it in')}
        </label>
      </FormSheet>
    </>
  );
};
