import { RE2JS } from 're2js';
import { z } from 'zod';
import type { FieldValidator, formFields } from '#/db/forms.ts';
import { Attachment } from '#/db/table.ts';
import { isShown } from './logic.ts';

/** What a visitor may send for one field: text, a number, a tick, picks or files. */
export const Answer = z.union([
  z.string().max(10_000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(1000)).max(300),
  z.array(Attachment).max(10),
]);

/** Answers by field id. */
export const Answers = z.record(z.string().max(100), Answer);

type Field = typeof formFields.$inferSelect;

/** A field the visitor got wrong, and what to fix, as the form shows it under the field. */
type AnswerError = { fieldId: string; message: string };

/** The preset rules a field's validator can name, each with what it says when broken. */
const PRESETS: Record<
  Extract<z.infer<typeof FieldValidator>, { type: 'preset' }>['preset'],
  [RegExp, string]
> = {
  email: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Enter a valid email address'],
  phone: [/^\+?[\d\s()-]{6,20}$/, 'Enter a valid phone number'],
  number: [/^-?\d+(\.\d+)?$/, 'Enter a number, such as 42 or -3.14'],
  date: [/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, 'Enter a date as YYYY-MM-DD'],
  dateTime: [
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])[ T]([01]\d|2[0-3]):[0-5]\d$/,
    'Enter a date and time as YYYY-MM-DD HH:MM',
  ],
  postalCode: [/^[A-Z0-9]{2,10}(?:[\s-][A-Z0-9]{2,7})?$/i, 'Enter a valid postal code'],
  alphanumeric: [/^[a-zA-Z0-9]+$/, 'Use only letters and digits'],
  mnVehicleRegistration: [
    /^\d{4}\s?[А-ЯӨҮ]{3}$/u,
    'Enter a vehicle registration number such as 1234 УБА',
  ],
};

/** Whether `pattern` is a pattern RE2 runs, in time linear in the text it checks. */
export const isPattern = (pattern: string) => {
  try {
    RE2JS.compile(pattern);

    return true;
  } catch {
    return false;
  }
};

/** What breaks the field's validator, or null when the text passes it. */
const validatorError = (validator: Field['validator'], text: string) => {
  if (!validator) return null;

  if (validator.type === 'preset') {
    const [pattern, message] = PRESETS[validator.preset];
    const value = validator.preset === 'mnVehicleRegistration' ? text.toUpperCase() : text;

    return pattern.test(value) ? null : (validator.message ?? message);
  }

  // RE2, so a member's pattern can't hang the API on a visitor's text.
  return RE2JS.compile(validator.pattern).test(text)
    ? null
    : (validator.message ?? 'The answer does not match the format');
};

const empty = (value: z.infer<typeof Answer> | undefined) =>
  value === undefined || value === '' || (Array.isArray(value) && value.length === 0);

/** A text or number answer as text; any other answer as none. */
const plain = (value: z.infer<typeof Answer>) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

/** What is wrong with a given answer for its field's type and validator, or null. */
export const typeError = (field: Field, value: z.infer<typeof Answer>) => {
  const picks = (list: z.infer<typeof Answer>) =>
    Array.isArray(list) &&
    list.every((item) => typeof item === 'string' && field.options.includes(item));

  switch (field.type) {
    case 'number':
      return typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(plain(value))
        ? null
        : 'Enter a number';
    case 'boolean':
      return typeof value === 'boolean' ? null : 'Tick or untick it';
    case 'date':
    case 'core:customer:birthDate':
      return /^\d{4}-\d{2}-\d{2}/.test(plain(value)) ? null : 'Enter a date as YYYY-MM-DD';
    case 'select':
    case 'radio':
    case 'select:countries':
    case 'core:customer:sex':
      return typeof value === 'string' && field.options.includes(value) ? null : 'Pick an option';
    case 'check':
      return picks(value) ? null : 'Pick from the options';
    case 'file':
    case 'core:customer:avatar':
      return Attachment.array().safeParse(value).success ? null : 'Attach a file';
    case 'core:customer:email':
      return validatorError({ type: 'preset', preset: 'email' }, plain(value));
    case 'core:customer:phone':
      return validatorError({ type: 'preset', preset: 'phone' }, plain(value));
    default:
      return typeof value === 'string' ? validatorError(field.validator, value) : 'Enter text';
  }
};

/**
 * The answers to keep for the form's `fields`, and what the visitor got wrong: an answer to a
 * hidden or unknown field is dropped, a shown required field must be answered, and each answer
 * must fit its field's type and validator.
 */
export const checkAnswers = (fields: Field[], answers: z.infer<typeof Answers>) => {
  const errors: AnswerError[] = [];
  const kept: [string, z.infer<typeof Answer>][] = [];

  for (const field of fields) {
    const value = answers[field.id];

    if (!isShown(field, answers)) continue;

    if (value === undefined || empty(value)) {
      if (field.isRequired) errors.push({ fieldId: field.id, message: 'This field is required' });
      continue;
    }

    const message = typeError(field, value);

    if (message) errors.push({ fieldId: field.id, message });
    else kept.push([field.id, value]);
  }

  return { values: Object.fromEntries(kept), errors };
};
