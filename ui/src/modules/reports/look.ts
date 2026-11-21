import type { InferClientOutputs } from '@orpc/client';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Client } from '@frontline/api';
import { storedFamily, type TConditionGroup, type TConditionRule } from 'erxes-ui';
import { useAtom } from 'jotai';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { useChange } from '~/shared/hooks.ts';
import type { CardSpec } from './cards.ts';
import type { Period, Section, Visual } from './period.ts';
import { VISUALS } from './figures.tsx';

export type SavedChart = InferClientOutputs<Client>['reports']['charts']['list'][number];

/** How a card narrows and draws what it counts. */
export type Look = Pick<SavedChart, 'visual' | 'period' | 'from' | 'to' | 'filter' | 'fieldId'>;

const OPERATORS = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'starts_with',
  'in',
  'not_in',
  'exists',
  'not_exists',
  'within_last',
  'more_than_ago',
  'within_next',
  'anniversary_within',
] as const satisfies readonly TConditionRule['op'][];

const Rule: z.ZodType<TConditionRule> = z.object({
  path: z.string(),
  op: z.enum(OPERATORS),
  value: z.unknown().optional(),
  where: z.lazy(() => Group).optional(),
});

/** A filter as browser storage keeps it, checked as it loads. */
const Group: z.ZodType<TConditionGroup> = z.lazy(() =>
  z.object({ match: z.enum(['all', 'any']), rules: z.array(z.union([Rule, Group])) }),
);

const PERIODS = [
  '7',
  '30',
  '90',
  'today',
  'yesterday',
  'this-week',
  'last-week',
  'this-month',
  'last-month',
  'this-year',
  'last-year',
  'custom',
] as const satisfies readonly Period[];

const VISUAL_NAMES = [
  'area',
  'line',
  'bar',
  'pie',
  'heatmap',
  'table',
] as const satisfies readonly Visual[];

/** What a built-in card's member changed of its look, by `<section>:<kind>`, kept in this browser. */
const cardLook = storedFamily({
  key: `${PLUGIN}:report-card`,
  schema: z
    .object({
      visual: z.enum(VISUAL_NAMES),
      period: z.enum(PERIODS),
      from: z.coerce.date().nullable(),
      to: z.coerce.date().nullable(),
      filter: Group.nullable(),
      fieldId: z.string().nullable(),
    })
    .partial(),
  initial: {},
});

/** A card's look before anyone changes it: its first visual, the last 30 days, no filter. */
const lookOf = (spec: CardSpec): Look => ({
  visual: spec.draws === 'list' ? 'table' : VISUALS[spec.draws][0],
  period: '30',
  from: null,
  to: null,
  filter: null,
  fieldId: null,
});

const chartsKey = orpc.reports.charts.key();

/** The organisation's saved charts on `section`'s page. */
export const useSavedCharts = (section: Section) =>
  useQuery(orpc.reports.charts.list.queryOptions({ input: { section } }));

export const useSaveChart = () =>
  useMutation(orpc.reports.charts.create.mutationOptions(useChange(chartsKey)));

export const useUpdateChart = () =>
  useMutation(orpc.reports.charts.update.mutationOptions(useChange(chartsKey)));

export const useRemoveChart = () =>
  useMutation(orpc.reports.charts.remove.mutationOptions(useChange(chartsKey)));

/**
 * A card's look and how to change it: a saved chart's is the organisation's, saved as it
 * changes; a built-in card's is this browser's.
 */
export const useLook = (spec: CardSpec, chart?: SavedChart) => {
  const [kept, setKept] = useAtom(cardLook(`${spec.section}:${spec.kind}`));
  const update = useUpdateChart();

  if (chart) {
    const look: Look = {
      visual: chart.visual,
      period: chart.period,
      from: chart.from,
      to: chart.to,
      filter: chart.filter,
      fieldId: chart.fieldId,
    };

    return {
      look,
      change: (patch: Partial<Look>) => update.mutate({ id: chart.id, ...patch }),
    };
  }

  return {
    look: { ...lookOf(spec), ...kept },
    change: (patch: Partial<Look>) => setKept((current) => ({ ...current, ...patch })),
  };
};

/** Where a card sits: its id and whether it spans the page. */
const Placed = z.object({ id: z.string(), wide: z.boolean() });

/** Each page's cards in the order and widths its member left them, kept in this browser. */
const pageLayout = storedFamily({
  key: `${PLUGIN}:report-layout`,
  schema: z.array(Placed),
  initial: [],
});

/**
 * The page's cards in the member's order and widths; a new card sits after the card before it
 * on the page, at its own width. A card no longer on the page, such as a removed chart, leaves.
 */
export const useLayout = (section: Section, cards: { id: string; wide: boolean }[]) => {
  const [kept, setKept] = useAtom(pageLayout(section));
  const ids = new Set(cards.map((card) => card.id));
  const placed = kept.filter((card) => ids.has(card.id));
  const known = new Set(placed.map((card) => card.id));
  const layout = [...placed];

  // A card new to the page goes after the one before it on the page, not below the list.
  for (const [index, card] of cards.entries()) {
    if (known.has(card.id)) continue;

    const before = cards[index - 1]?.id;
    const at = layout.findIndex((one) => one.id === before);

    layout.splice(at + 1, 0, card);
  }

  return {
    layout,
    move: (from: number, to: number) => {
      const next = [...layout];
      const [card] = next.splice(from, 1);

      if (card) next.splice(to, 0, card);

      setKept(next);
    },
    widen: (id: string, wide: boolean) =>
      setKept(layout.map((card) => (card.id === id ? { ...card, wide } : card))),
  };
};
