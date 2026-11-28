import {
  type DataExtensionCondition,
  conditionHolds as coreHolds,
} from '@erxes/core-contract/dataExtensionConditions';
import { describe, expect, it } from 'vite-plus/test';
import {
  type ConditionField,
  conditionHolds,
  requiredByConditions,
  shownByConditions,
} from '../conditions.ts';

const VALUES = {
  plan: 'team',
  seats: 4,
  labels: ['vip', 'new'],
  note: '',
  starts: '2026-11-28',
  urgent: false,
  address: { city: 'Darkhan', street: null },
};

const CONDITIONS: DataExtensionCondition[] = [
  { field: 'plan', operator: 'eq', value: 'team' },
  { field: 'plan', operator: 'neq', value: 'team' },
  { field: 'plan', operator: 'in', value: ['solo', 'team'] },
  { field: 'labels', operator: 'eq', value: 'vip' },
  { field: 'labels', operator: 'contains', value: 'NE' },
  { field: 'address', operator: 'contains', value: 'dark' },
  { field: 'seats', operator: 'greaterThan', value: 3 },
  { field: 'seats', operator: 'lessThan', value: 3 },
  { field: 'starts', operator: 'greaterThan', value: '2026-01-01' },
  { field: 'note', operator: 'isEmpty' },
  { field: 'note', operator: 'isNotEmpty' },
  { field: 'urgent', operator: 'eq', value: false },
  { field: 'gone', operator: 'isEmpty' },
  {
    match: 'any',
    rules: [
      { field: 'plan', operator: 'eq', value: 'solo' },
      { field: 'seats', operator: 'greaterThan', value: 1 },
    ],
  },
  {
    match: 'all',
    rules: [
      { field: 'plan', operator: 'eq', value: 'solo' },
      { field: 'seats', operator: 'greaterThan', value: 1 },
    ],
  },
];

const field = (id: string, more: Partial<ConditionField> = {}): ConditionField => ({
  id,
  key: id,
  required: false,
  visibleWhen: null,
  hiddenWhen: null,
  requiredWhen: null,
  ...more,
});

describe("the messenger's field conditions", () => {
  it.each(CONDITIONS)('judge %j as core does', (condition) => {
    expect(conditionHolds(condition, VALUES)).toBe(coreHolds(condition, VALUES));
  });

  it('show a field while its rule holds, and hide what a hidden answer shows', () => {
    const plan = field('plan');
    const seats = field('seats', { visibleWhen: { field: 'plan', operator: 'eq', value: 'team' } });
    const desks = field('desks', { visibleWhen: { field: 'seats', operator: 'isNotEmpty' } });
    const fields = [plan, seats, desks];

    expect(shownByConditions(fields, { plan: 'team', seats: 4 })).toEqual(fields);
    expect(shownByConditions(fields, { plan: 'solo', seats: 4 })).toEqual([plan]);
  });

  it('ask for an answer when required, or while its rule holds', () => {
    const plan = field('plan', { required: true });
    const reason = field('reason', { requiredWhen: { field: 'plan', operator: 'eq', value: 'x' } });

    expect(requiredByConditions(plan, [plan, reason], {})).toBe(true);
    expect(requiredByConditions(reason, [plan, reason], { plan: 'y' })).toBe(false);
    expect(requiredByConditions(reason, [plan, reason], { plan: 'x' })).toBe(true);
  });
});
