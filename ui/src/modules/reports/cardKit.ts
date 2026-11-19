import { useQuery } from '@tanstack/react-query';
import { type TConditionGroup, useFormat } from 'erxes-ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { usePriorityNames, useStages } from '@/pipelines/queries.ts';
import { orpc } from '~/orpc.ts';
import { useKindNames } from '~/shared/kinds.tsx';
import { choicesQuery } from '~/shared/reference.ts';
import type { Section } from './period.ts';
import { live } from './queries.ts';
import type { Figures } from './figures.tsx';
import { useSpanText } from './Tile.tsx';

/** What a card asks its report for: its period, its filter as JSON, and a property card's field. */
export type CardInput = {
  from: Date;
  to: Date;
  timeZone: string;
  filter?: string;
  fieldId?: string | null;
};

/** The words and names a card's rows need. */
const useLabels = () => {
  const { t } = useTranslation('frontline');
  const format = useFormat();

  return {
    t,
    date: (date: Date) => format.date(date, 'yyyy-MM-dd HH:mm'),
    kinds: useKindNames(),
    priorities: usePriorityNames(),
    stages: useStages(),
    statuses: useQuery(choicesQuery).data?.statuses ?? [],
    span: useSpanText(),
  };
};

export type Labels = ReturnType<typeof useLabels>;

/** The one pipeline a filter keeps, when a rule at its top names just one. */
export const pipelineOf = (filter: TConditionGroup | null) => {
  const rule =
    filter?.match === 'all'
      ? filter.rules.find((part) => 'path' in part && part.path === 'subject.pipelineId')
      : undefined;

  const value = rule && 'value' in rule ? rule.value : undefined;

  return Array.isArray(value) && value.length === 1 && typeof value[0] === 'string'
    ? value[0]
    : null;
};

/** The lists whose filter a card's filter is: the inbox's, the tickets' or the calls'. */
export type Records = 'conversations' | 'tickets' | 'calls';

/** A translation key and its English text. */
type Text = [key: string, text: string];

/** What a chart card draws, once its report loads. */
export type CardBody = { error: Error | null; refetch: () => void; figures?: Figures };

/** A chart card's report: it loads it over `input` and hands `children` the figures to draw. */
export type CardBodyComponent = (props: {
  input: CardInput;
  filter: TConditionGroup | null;
  children: (body: CardBody) => ReactNode;
}) => ReactNode;

/** A card a report page shows: a chart of its report, or the list of the records it counts. */
export type CardSpec = {
  /** Its id, which saved charts and the page's layout keep: renaming one drops it from them. */
  kind: string;
  section: Section;
  /** Its title's translation key and English text. */
  title: Text;
  /** Whether it starts across the page's whole width rather than half. */
  wide: boolean;
  records: Records;
  /** What it says when its period holds nothing. */
  empty: Text;
  /** "Tickets by property": the card picks a custom field. */
  property?: true;
} & (
  | {
      draws: Figures['type'];
      Body: CardBodyComponent;
    }
  | { draws: 'list'; Body?: never }
);

/** A card as written below; its page gives it its section, records and width. */
type Draft = CardSpec extends infer Spec
  ? Spec extends CardSpec
    ? Omit<Spec, 'section' | 'records' | 'wide'>
    : never
  : never;

/** The cards of `section`, over `records`, those whose figures are in `wide` across the page. */
export const cardsOf = (
  section: Section,
  records: Records,
  wide: CardSpec['draws'][],
  drafts: Draft[],
): CardSpec[] =>
  drafts.map((draft) => ({ ...draft, section, records, wide: wide.includes(draft.draws) }));

/** A chart card's body from a report's query and the figures it draws of the report. */
export const fromReport = <Data>(
  useReport: (input: CardInput) => {
    data: Data | undefined;
    error: Error | null;
    refetch: () => unknown;
  },
  toFigures: (data: Data, labels: Labels, filter: TConditionGroup | null) => Figures,
) =>
  function ReportBody({ input, filter, children }: Parameters<CardBodyComponent>[0]) {
    const query = useReport(input);
    const labels = useLabels();

    return children({
      error: query.error,
      refetch: () => void query.refetch(),
      figures: query.data === undefined ? undefined : toFigures(query.data, labels, filter),
    });
  };

export const useConversationsData = ({ fieldId: _, ...input }: CardInput) =>
  useQuery(orpc.reports.conversations.queryOptions(live(input)));

export const useTicketsData = ({ fieldId: _, ...input }: CardInput) =>
  useQuery(orpc.reports.tickets.queryOptions(live(input)));

export const useMetaData = ({ fieldId: _, ...input }: CardInput) =>
  useQuery(orpc.reports.meta.queryOptions(live(input)));

export const useCallsData = ({ fieldId: _, ...input }: CardInput) =>
  useQuery(orpc.reports.calls.queryOptions(live(input)));

export const usePropertiesData = ({ fieldId, ...input }: CardInput) =>
  useQuery({
    ...orpc.reports.ticketProperties.queryOptions(live({ ...input, fieldId: fieldId ?? '' })),
    enabled: Boolean(fieldId),
  });

/** The chart palette, a series each in turn. */
export const CHART = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const;
