import { DndContext, type DragEndEvent } from '@dnd-kit/core';
import { rectSortingStrategy, SortableContext, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { IconChartBar, IconRefresh } from '@tabler/icons-react';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button,
  cn,
  localTimeZone,
  PageContainer,
  ScrollArea,
  Select,
  storedFamily,
} from 'erxes-ui';
import { useAtom, useAtomValue } from 'jotai';
import { type ReactNode, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { orpc } from '~/orpc.ts';
import { PLUGIN } from '~/plugin.ts';
import { useListDrag } from '~/shared/drag.ts';
import { AppHeader } from '~/shared/Header.tsx';
import { CallStats } from './CallTiles.tsx';
import { CARDS, type CardSpec } from './cards.ts';
import { ConversationStats } from './ConversationTiles.tsx';
import { conversationLinks } from './conversationLinks.ts';
import { type SavedChart, useLayout, useSavedCharts } from './look.ts';
import { MetaStats } from './MetaTiles.tsx';
import { minuteEnd, type Period, rangeOf, type Section, usePeriodNames } from './period.ts';
import { live } from './queries.ts';
import { RECORDS_KEY } from './records.ts';
import { type Placement, ReportCard } from './ReportCard.tsx';
import { useTicketLinks } from './ticketLinks.ts';
import { TicketStats } from './TicketTiles.tsx';
import { everyFewSeconds, Tile } from './Tile.tsx';

export const REPORTS_PATH = `/${PLUGIN}/reports`;

/**
 * Each report page's address under `REPORTS_PATH`, the old pages' own: the conversations' is the
 * overview at its root.
 */
export const SECTION_PATHS = {
  conversations: REPORTS_PATH,
  tickets: `${REPORTS_PATH}/ticket`,
  meta: `${REPORTS_PATH}/facebook`,
  calls: `${REPORTS_PATH}/call`,
} satisfies Record<Section, string>;

/** Each report page's name, as the sidebar and the breadcrumb show it. */
export const useSectionNames = (): Record<Section, string> => {
  const { t } = useTranslation('frontline');

  return {
    conversations: t('frontline-overview', 'Overview'),
    tickets: t('tickets', 'Tickets'),
    meta: t('facebook-and-instagram', 'Facebook and Instagram'),
    calls: t('calls', 'Calls'),
  };
};

const KPI_PERIODS = [
  'today',
  '7',
  '30',
  '90',
  'this-month',
  'last-month',
  'this-year',
] as const satisfies readonly Period[];

/** Each page's headline period, kept in this browser. */
const kpiPeriod = storedFamily({
  key: `${PLUGIN}:report-kpi-period`,
  schema: z.enum(KPI_PERIODS),
  initial: '30',
});

/** Asks every report on the page again. */
const RefreshButton = () => {
  const { t } = useTranslation('frontline');
  const queryClient = useQueryClient();
  const fetching = useIsFetching({ queryKey: orpc.reports.key() }) > 0;

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('refresh', 'Refresh')}
      onClick={() => {
        void queryClient.invalidateQueries({ queryKey: orpc.reports.key() });
        void queryClient.invalidateQueries({ queryKey: RECORDS_KEY });
      }}
    >
      <IconRefresh className={fetching ? 'animate-spin' : undefined} />
    </Button>
  );
};

/** The header's pick of the headline numbers' period. */
const KpiPeriodPick = ({ section }: { section: Section }) => {
  const { t } = useTranslation('frontline');
  const names = usePeriodNames();
  const [period, setPeriod] = useAtom(kpiPeriod(section));

  return (
    <Select
      value={period}
      onValueChange={(value) => {
        const next = KPI_PERIODS.find((one) => one === value);

        if (next) setPeriod(next);
      }}
    >
      <Select.Trigger className="w-auto" aria-label={t('report-period', 'Period')}>
        <Select.Value>{names[period]}</Select.Value>
      </Select.Trigger>
      <Select.Content>
        {KPI_PERIODS.map((one) => (
          <Select.Item key={one} value={one}>
            {names[one]}
          </Select.Item>
        ))}
      </Select.Content>
    </Select>
  );
};

/** The headline numbers' period: its bounds, today's to the current minute, and the input of its reports. */
const useKpiInput = (period: Period) => {
  const now = useSyncExternalStore(everyFewSeconds, minuteEnd);
  const range = rangeOf(period, now);

  return { range, input: live({ ...range, timeZone: localTimeZone() ?? 'UTC' }) };
};

type KpiProps = { period: Period };

const ConversationKpis = ({ period }: KpiProps) => {
  const { range, input } = useKpiInput(period);

  return (
    <Tile query={useQuery(orpc.reports.conversations.queryOptions(input))}>
      {(report) => <ConversationStats report={report} links={conversationLinks(range, null)} />}
    </Tile>
  );
};

const TicketKpis = ({ period }: KpiProps) => {
  const { range, input } = useKpiInput(period);
  const links = useTicketLinks(range, null);

  return (
    <Tile query={useQuery(orpc.reports.tickets.queryOptions(input))}>
      {(report) => <TicketStats report={report} links={links} />}
    </Tile>
  );
};

const MetaKpis = ({ period }: KpiProps) => (
  <Tile query={useQuery(orpc.reports.meta.queryOptions(useKpiInput(period).input))}>
    {(report) => <MetaStats report={report} />}
  </Tile>
);

const CallKpis = ({ period }: KpiProps) => (
  <Tile query={useQuery(orpc.reports.calls.queryOptions(useKpiInput(period).input))}>
    {(report) => <CallStats report={report} />}
  </Tile>
);

/** Each page's headline numbers over the period of its header. */
const KPIS = {
  conversations: ConversationKpis,
  tickets: TicketKpis,
  meta: MetaKpis,
  calls: CallKpis,
} satisfies Record<Section, (props: KpiProps) => ReactNode>;

/** A card on the page's grid, dragged by its handle, half the width or all of it. */
const Placed = ({
  id,
  spec,
  chart,
  wide,
  onWide,
}: {
  id: string;
  spec: CardSpec;
  chart?: SavedChart;
  wide: boolean;
  onWide: (wide: boolean) => void;
}) => {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id,
  });

  const { t } = useTranslation('frontline');
  const placement: Placement = { wide, onWide, handle: { attributes, listeners } };

  return (
    <section
      ref={setNodeRef}
      aria-label={chart?.name ?? t(...spec.title)}
      style={{
        '--sortable-transform': CSS.Translate.toString(transform),
        '--sortable-transition': transition,
      }}
      className={cn(
        'sortable col-span-12 flex flex-col overflow-hidden rounded-xl border bg-background shadow-xs',
        !wide && 'lg:col-span-6',
        spec.draws === 'list' ? 'min-h-96' : 'h-72',
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <ReportCard spec={spec} chart={chart} placement={placement} />
    </section>
  );
};

/**
 * A report page: its headline numbers, then its cards, the built-in ones and the charts members
 * saved, in the order and widths this member left them. Each card has its own period, filter and
 * look; a saved chart keeps them for everyone.
 */
export const ReportsPage = ({ section }: { section: Section }) => {
  const { t } = useTranslation('frontline');
  const names = useSectionNames();
  const period = useAtomValue(kpiPeriod(section));
  const saved = useSavedCharts(section).data ?? [];
  const specs = CARDS[section];
  const Kpis = KPIS[section];

  const cards = [
    ...specs.map((spec) => ({ id: spec.kind, wide: spec.wide, spec, chart: undefined })),
    ...saved.flatMap((chart) => {
      const spec = specs.find((one) => one.kind === chart.kind);

      return spec ? [{ id: `chart:${chart.id}`, wide: spec.wide, spec, chart }] : [];
    }),
  ];

  const byId = new Map(cards.map((card) => [card.id, card]));
  const { layout, move, widen } = useLayout(section, cards);

  const nameOf = (id: string | number) => {
    const card = byId.get(String(id));

    return card ? (card.chart?.name ?? t(...card.spec.title)) : '';
  };

  const drag = useListDrag(nameOf);

  const dragEnd = ({ active, over }: DragEndEvent) => {
    const from = layout.findIndex((card) => card.id === active.id);
    const to = layout.findIndex((card) => card.id === over?.id);

    if (from >= 0 && to >= 0 && from !== to) move(from, to);
  };

  return (
    <PageContainer>
      <AppHeader
        icon={IconChartBar}
        app={{ label: t('reports', 'Reports'), to: REPORTS_PATH }}
        levels={[{ label: names[section] }]}
      >
        <RefreshButton />
        <KpiPeriodPick section={section} />
      </AppHeader>
      <ScrollArea>
        <div className="flex w-full flex-col gap-4 p-4">
          <section
            aria-label={t('report-summary', 'Summary')}
            className="rounded-xl border bg-background shadow-xs"
          >
            <Kpis period={period} />
          </section>
          <DndContext {...drag} modifiers={[]} onDragEnd={dragEnd}>
            <SortableContext items={layout.map((card) => card.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-12 gap-4">
                {layout.flatMap((placed) => {
                  const card = byId.get(placed.id);

                  return card
                    ? [
                        <Placed
                          key={placed.id}
                          id={placed.id}
                          spec={card.spec}
                          chart={card.chart}
                          wide={placed.wide}
                          onWide={(wide) => widen(placed.id, wide)}
                        />,
                      ]
                    : [];
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </ScrollArea>
    </PageContainer>
  );
};
