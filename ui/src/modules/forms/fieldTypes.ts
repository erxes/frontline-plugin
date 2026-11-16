import { useTranslation } from 'react-i18next';
import type { FormField } from './useForms.ts';

/** The kinds of input a field can be, then the customer fields a submission writes. */
export const FIELD_TYPES = [
  'text',
  'textarea',
  'number',
  'boolean',
  'date',
  'select',
  'select:countries',
  'radio',
  'check',
  'file',
  'core:customer:firstName',
  'core:customer:middleName',
  'core:customer:lastName',
  'core:customer:email',
  'core:customer:phone',
  'core:customer:description',
  'core:customer:sex',
  'core:customer:birthDate',
  'core:customer:avatar',
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

/** The types whose answers pick from the field's options. */
export const PICK_TYPES: readonly string[] = ['select', 'radio', 'check'];

/** The types a member writes a rule for, as text. */
const TEXT_TYPES: readonly string[] = ['text', 'textarea', 'core:customer:description'];

/** Whether the field's answers can be checked by a validator. */
export const takesValidator = (field: Pick<FormField, 'type'>) => TEXT_TYPES.includes(field.type);

export const PRESETS = [
  'email',
  'phone',
  'number',
  'date',
  'dateTime',
  'postalCode',
  'alphanumeric',
  'mnVehicleRegistration',
] as const;

export const OPERATORS = [
  'is',
  'isNot',
  'contains',
  'doesNotContain',
  'startsWith',
  'endsWith',
  'greaterThan',
  'lessThan',
  'isUnknown',
  'hasAnyValue',
] as const;

/** The operators that compare against no value. */
export const VALUELESS: readonly string[] = ['isUnknown', 'hasAnyValue'];

/** A field type as members read it. */
export const useFieldTypeNames = (): Record<FieldType, string> => {
  const { t } = useTranslation('frontline');

  return {
    text: t('field-text', 'Text'),
    textarea: t('field-textarea', 'Long text'),
    number: t('field-number', 'Number'),
    boolean: t('field-boolean', 'Yes or no'),
    date: t('field-date', 'Date'),
    select: t('field-select', 'Dropdown'),
    'select:countries': t('field-countries', 'Country'),
    radio: t('field-radio', 'One choice'),
    check: t('field-check', 'Several choices'),
    file: t('field-file', 'File'),
    'core:customer:firstName': t('field-first-name', 'First name'),
    'core:customer:middleName': t('field-middle-name', 'Middle name'),
    'core:customer:lastName': t('field-last-name', 'Last name'),
    'core:customer:email': t('field-email', 'Email'),
    'core:customer:phone': t('field-phone', 'Phone'),
    'core:customer:description': t('field-description', 'About the customer'),
    'core:customer:sex': t('field-sex', 'Sex'),
    'core:customer:birthDate': t('field-birth-date', 'Birth date'),
    'core:customer:avatar': t('field-avatar', 'Photo'),
  };
};

/** A type's name, or the stored type itself for one this list lacks. */
export const useFieldTypeName = () => {
  const names = useFieldTypeNames();

  return (type: string) => {
    const known = FIELD_TYPES.find((each) => each === type);

    return known ? names[known] : type;
  };
};

/** A preset validator as members read it. */
export const usePresetNames = (): Record<(typeof PRESETS)[number], string> => {
  const { t } = useTranslation('frontline');

  return {
    email: t('field-email', 'Email'),
    phone: t('field-phone', 'Phone'),
    number: t('field-number', 'Number'),
    date: t('field-date', 'Date'),
    dateTime: t('field-date-time', 'Date and time'),
    postalCode: t('field-postal-code', 'Postal code'),
    alphanumeric: t('field-alphanumeric', 'Letters and digits'),
    mnVehicleRegistration: t('field-mn-vehicle', 'Mongolian vehicle plate'),
  };
};

/** A rule's operator as members read it. */
export const useOperatorNames = (): Record<(typeof OPERATORS)[number], string> => {
  const { t } = useTranslation('frontline');

  return {
    is: t('logic-is', 'is'),
    isNot: t('logic-is-not', 'is not'),
    contains: t('logic-contains', 'contains'),
    doesNotContain: t('logic-does-not-contain', 'does not contain'),
    startsWith: t('logic-starts-with', 'starts with'),
    endsWith: t('logic-ends-with', 'ends with'),
    greaterThan: t('logic-greater-than', 'is greater than'),
    lessThan: t('logic-less-than', 'is less than'),
    isUnknown: t('logic-is-unknown', 'is empty'),
    hasAnyValue: t('logic-has-any-value', 'has any value'),
  };
};
