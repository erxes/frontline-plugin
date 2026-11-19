// Whether a field shows and is answered enough, for a form and the messenger's ticket form, and
// whether a form's callout shows. The widget and the UI's live preview import this file
// (`@frontline/api/logic`), so it imports types only.
import type { z } from 'zod';
import type { FieldLogic, LOGIC_ACTIONS } from '#/db/forms.ts';

type Logic = z.infer<typeof FieldLogic>;

export type LogicOperator = Logic['operator'];

/** What a field's show and hide rules need of it. */
export type LogicField = {
  id: string;
  logicAction: (typeof LOGIC_ACTIONS)[number] | null;
  logics: Logic[];
};

/** An answer as text for comparing: a list joins its items. */
const textOf = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item) => typeof item === 'string').join(', ')
    : typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : '';

/** Orders two answers as numbers, or as text when either isn't one, so ISO dates order too. */
const order = (text: string, wanted: string) => {
  const [a, b] = [Number(text), Number(wanted)];

  return Number.isNaN(a) || Number.isNaN(b) ? text.localeCompare(wanted) : a - b;
};

const holds = (logic: Logic, answer: unknown): boolean => {
  const { operator, value = '' } = logic;
  const text = textOf(answer).toLowerCase();
  const wanted = value.toLowerCase();

  switch (operator) {
    case 'is':
      return Array.isArray(answer)
        ? answer.some((item) => textOf(item).toLowerCase() === wanted)
        : text === wanted;
    // A list that holds the value is it, whatever else it holds.
    case 'isNot':
      return !holds({ ...logic, operator: 'is' }, answer);
    case 'contains':
      return text.includes(wanted);
    case 'doesNotContain':
      return !text.includes(wanted);
    case 'startsWith':
      return text.startsWith(wanted);
    case 'endsWith':
      return text.endsWith(wanted);
    case 'greaterThan':
      return text !== '' && order(text, wanted) > 0;
    case 'lessThan':
      return text !== '' && order(text, wanted) < 0;
    case 'isUnknown':
      return text === '';
    case 'hasAnyValue':
      return text !== '';
  }
};

/**
 * Whether `field` shows with these `answers`, by field id: a "show" field only once all its
 * rules hold, a "hide" field until they all do, any other field always.
 */
export const isShown = (field: LogicField, answers: Record<string, unknown>) => {
  if (!field.logicAction || field.logics.length === 0) return true;

  const all = field.logics.every((logic) => holds(logic, answers[logic.fieldId]));

  return field.logicAction === 'show' ? all : !all;
};

/**
 * Whether `value` leaves its field unanswered, so a shown required field asks for it: none, blank
 * text or no picks. A box left unticked is an answer.
 */
export const unanswered = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === '' ||
  (Array.isArray(value) && value.length === 0);

/** Whether the form opens on its callout: not skipped, and it has a title, text or image. */
export const showsCallout = (form: {
  calloutSkip: boolean;
  calloutTitle: string | null;
  calloutBody: string | null;
  calloutImage: unknown;
}) => !form.calloutSkip && Boolean(form.calloutTitle || form.calloutBody || form.calloutImage);
