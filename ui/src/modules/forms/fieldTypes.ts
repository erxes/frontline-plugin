import {
  type Icon,
  IconAlignLeft,
  IconCake,
  IconCalendar,
  IconCircleDot,
  IconFileDescription,
  IconForms,
  IconGenderBigender,
  IconMail,
  IconNumber,
  IconPaperclip,
  IconPhone,
  IconPhoto,
  IconSelector,
  IconSquareCheck,
  IconToggleLeft,
  IconUser,
  IconWorld,
} from '@tabler/icons-react';
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

/** Each type's icon, the same in the add menu and on the field's card. */
export const FIELD_ICONS: Record<FieldType, Icon> = {
  text: IconForms,
  textarea: IconAlignLeft,
  number: IconNumber,
  boolean: IconToggleLeft,
  date: IconCalendar,
  select: IconSelector,
  'select:countries': IconWorld,
  radio: IconCircleDot,
  check: IconSquareCheck,
  file: IconPaperclip,
  'core:customer:firstName': IconUser,
  'core:customer:middleName': IconUser,
  'core:customer:lastName': IconUser,
  'core:customer:email': IconMail,
  'core:customer:phone': IconPhone,
  'core:customer:description': IconFileDescription,
  'core:customer:sex': IconGenderBigender,
  'core:customer:birthDate': IconCake,
  'core:customer:avatar': IconPhoto,
};

/** Types whose answers read alike: text, a date, or one of the field's options. */
const KINDS: readonly (readonly string[])[] = [
  [
    'text',
    'textarea',
    'core:customer:firstName',
    'core:customer:middleName',
    'core:customer:lastName',
    'core:customer:email',
    'core:customer:phone',
    'core:customer:description',
  ],
  ['date', 'core:customer:birthDate'],
  ['select', 'radio'],
];

/**
 * The types a field of `type` changes to in place, its own among them. Its answers and the rules
 * other fields hold on it read the same in each; any other type is a new field.
 */
export const convertibleTo = (type: string) => {
  const kind = KINDS.find((each) => each.includes(type)) ?? [type];

  return FIELD_TYPES.filter((each) => kind.includes(each));
};

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

type Operator = (typeof OPERATORS)[number];

const CHOICE_TYPES: readonly string[] = [
  'select',
  'select:countries',
  'radio',
  'check',
  'boolean',
  'core:customer:sex',
];

const ORDERED_TYPES: readonly string[] = ['number', 'date', 'core:customer:birthDate'];

/**
 * The comparisons a rule on a field of `type` makes sense with: a picked option is or isn't
 * one, a number or date is also above or below one, and text also contains or starts with one.
 */
export const operatorsFor = (type: string): readonly Operator[] => {
  if (CHOICE_TYPES.includes(type)) return ['is', 'isNot', 'isUnknown', 'hasAnyValue'];

  if (ORDERED_TYPES.includes(type))
    return ['is', 'isNot', 'greaterThan', 'lessThan', 'isUnknown', 'hasAnyValue'];

  return OPERATORS.filter((operator) => operator !== 'greaterThan' && operator !== 'lessThan');
};

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
