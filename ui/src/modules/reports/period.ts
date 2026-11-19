import type { InferClientInputs } from '@orpc/client';
import type { Client } from '@frontline/api';
import { useTranslation } from 'react-i18next';

/** What a report card or saved chart holds besides its name, as the API keeps a chart. */
type ChartInput = InferClientInputs<Client>['reports']['charts']['create'];

export type Period = ChartInput['period'];

export type Visual = ChartInput['visual'];

export type Section = ChartInput['section'];

/** The start of the day `days` days after `date`'s, in the browser's time zone. */
const dayStart = (date: Date, days = 0) => {
  const start = new Date(date);

  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + days);

  return start;
};

/** The start of the week holding `date`, a Monday, `weeks` weeks on. */
const weekStart = (date: Date, weeks = 0) => {
  const start = dayStart(date);

  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + weeks * 7);

  return start;
};

const monthStart = (date: Date, months = 0) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);

const yearStart = (date: Date, years = 0) => new Date(date.getFullYear() + years, 0, 1);

/** The end of the current minute, so what happened seconds ago counts. */
export const minuteEnd = () => {
  const end = new Date();

  end.setSeconds(60, 0);

  return end.getTime();
};

/**
 * The days `period` covers, in the browser's time zone, up to `now` for one that runs to today:
 * whole calendar days, today's to the current minute. A custom period runs from the start of
 * `from`'s day to the end of `to`'s.
 */
export const rangeOf = (
  period: Period,
  now: number,
  custom: { from: Date | null; to: Date | null } = { from: null, to: null },
): { from: Date; to: Date } => {
  const today = new Date(now);
  const end = new Date(now);

  switch (period) {
    case '7':
    case '30':
    case '90':
      return { from: dayStart(today, 1 - Number(period)), to: end };
    case 'today':
      return { from: dayStart(today), to: end };
    case 'yesterday':
      return { from: dayStart(today, -1), to: dayStart(today) };
    case 'this-week':
      return { from: weekStart(today), to: end };
    case 'last-week':
      return { from: weekStart(today, -1), to: weekStart(today) };
    case 'this-month':
      return { from: monthStart(today), to: end };
    case 'last-month':
      return { from: monthStart(today, -1), to: monthStart(today) };
    case 'this-year':
      return { from: yearStart(today), to: end };
    case 'last-year':
      return { from: yearStart(today, -1), to: yearStart(today) };
    case 'custom':
      return custom.from && custom.to
        ? { from: custom.from, to: new Date(custom.to.getTime() + 60_000) }
        : { from: dayStart(today, -29), to: end };
  }
};

/** Each period's name, in the order the menu lists them; a period added to the API fails here. */
export const usePeriodNames = () => {
  const { t } = useTranslation('frontline');

  return {
    '7': t('last-days', 'Last {{count}} days', { count: 7 }),
    '30': t('last-days', 'Last {{count}} days', { count: 30 }),
    '90': t('last-days', 'Last {{count}} days', { count: 90 }),
    today: t('today', 'Today'),
    yesterday: t('yesterday', 'Yesterday'),
    'this-week': t('this-week', 'This week'),
    'last-week': t('last-week', 'Last week'),
    'this-month': t('this-month', 'This month'),
    'last-month': t('last-month', 'Last month'),
    'this-year': t('this-year', 'This year'),
    'last-year': t('last-year', 'Last year'),
    custom: t('custom-period', 'Custom'),
  } satisfies Record<Period, string>;
};
