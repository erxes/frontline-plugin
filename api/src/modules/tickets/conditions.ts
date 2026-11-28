// When a ticket field shows and needs an answer on the messenger's ticket form, by Data
// Extensions' `visibleWhen`, `hiddenWhen` and `requiredWhen`. Core's `fieldShows` and
// `fieldRequired` (`@erxes/core-contract/dataExtensionConditions`) live next to its zod schemas,
// which the widget doesn't bundle, so the widget imports these (`@frontline/api/conditions`)
// and this file imports types only. `conditions.test.ts` holds them to core's.
import type {
  DataExtensionCondition,
  DataExtensionRule,
} from '@erxes/core-contract/dataExtensionConditions';

/** What a field's conditions need of it: its id, its key and its settings. */
export type ConditionField = {
  id: string;
  key: string;
  required: boolean;
  visibleWhen: DataExtensionCondition | null;
  hiddenWhen: DataExtensionCondition | null;
  requiredWhen: DataExtensionCondition | null;
};

type Values = Record<string, unknown>;

const isEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined || value === '') return true;

  if (Array.isArray(value)) return value.length === 0;

  return typeof value === 'object' && Object.values(value).every(isEmpty);
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const itemsOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

const matches = (value: unknown, wanted: unknown) =>
  itemsOf(value).some((item) => same(item, wanted));

const textsOf = (value: unknown): string[] => {
  if (typeof value === 'string') return [value];

  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];

  if (value && typeof value === 'object') return Object.values(value).flatMap(textsOf);

  return [];
};

const order = (a: unknown, b: unknown) => {
  if (typeof a === 'number' && typeof b === 'number') return Math.sign(a - b);

  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;

  return null;
};

const ruleHolds = (rule: DataExtensionRule, values: Values) => {
  // A rule on a field the form doesn't show (no key in `values`) never holds.
  if (!(rule.field in values)) return false;

  const value = values[rule.field] ?? null;

  switch (rule.operator) {
    case 'isNotEmpty':
      return !isEmpty(value);
    case 'isEmpty':
      return isEmpty(value);
    case 'eq':
      return matches(value, rule.value);
    case 'neq':
      return !matches(value, rule.value);
    case 'in':
      return Array.isArray(rule.value) && rule.value.some((wanted) => matches(value, wanted));
    case 'contains': {
      const wanted = textsOf(rule.value).join(' ').toLowerCase();

      return textsOf(value).some((text) => text.toLowerCase().includes(wanted));
    }

    case 'greaterThan':
      return itemsOf(value).some((item) => order(item, rule.value) === 1);
    case 'lessThan':
      return itemsOf(value).some((item) => order(item, rule.value) === -1);
  }
};

/** Whether values by field key meet a condition, as core's `conditionHolds` judges it. */
export const conditionHolds = (condition: DataExtensionCondition, values: Values) => {
  const rules = 'rules' in condition ? condition.rules : [condition];
  const holds = (rule: DataExtensionRule) => ruleHolds(rule, values);

  return 'match' in condition && condition.match === 'any' ? rules.some(holds) : rules.every(holds);
};

const shows = (field: ConditionField, values: Values) =>
  (!field.visibleWhen || conditionHolds(field.visibleWhen, values)) &&
  !(field.hiddenWhen && conditionHolds(field.hiddenWhen, values));

/**
 * The `fields` that show with these `answers` (by field id), each judged only by the answers of
 * fields that show themselves, so a hidden field's leftover answer shows or hides nothing.
 * Hiding one field can hide another, so it settles in at most one pass a field.
 */
export const shownByConditions = <Field extends ConditionField>(
  fields: Field[],
  answers: Values,
) => {
  let shown = fields;

  for (let pass = 0; pass < fields.length; pass += 1) {
    const byKey = Object.fromEntries(shown.map((field) => [field.key, answers[field.id] ?? null]));
    const next = fields.filter((field) => shows(field, byKey));

    if (next.length === shown.length && next.every((field, at) => field === shown[at])) break;

    shown = next;
  }

  return shown;
};

/** Whether a shown field needs an answer: it is required, or its `requiredWhen` holds. */
export const requiredByConditions = (
  field: ConditionField,
  shown: ConditionField[],
  answers: Values,
) =>
  field.required ||
  Boolean(
    field.requiredWhen &&
    conditionHolds(
      field.requiredWhen,
      Object.fromEntries(shown.map((other) => [other.key, answers[other.id] ?? null])),
    ),
  );
