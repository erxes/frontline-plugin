import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltipContent,
  Skeleton,
  useFormat,
} from 'erxes-ui';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import type * as Recharts from 'recharts';
import { Nothing } from './Tile.tsx';

/** A report's `YYYY-MM-DD` day as a local date, so it shows as that day in any time zone. */
const localDay = (day: string) => new Date(`${day}T00:00:00`);

/** How a series of days draws: a filled area, a line or bars per series. */
export type SeriesVisual = 'area' | 'line' | 'bar';

type SeriesProps = {
  days: { day: string }[];
  config: Record<string, { label: string; color: string }>;
  visual: SeriesVisual;
};

/** The grid, axes and tooltip every chart over days shares, with a legend when `legend`. */
const useAxes = (
  { CartesianGrid, Legend, Tooltip, XAxis, YAxis }: typeof Recharts,
  legend: boolean,
) => {
  const format = useFormat();

  return [
    <CartesianGrid key="grid" vertical={false} />,
    <XAxis
      key="x"
      dataKey="day"
      tickLine={false}
      axisLine={false}
      minTickGap={24}
      tickFormatter={(day: string) => format.date(localDay(day), 'MMM d')}
    />,
    <YAxis key="y" allowDecimals={false} tickLine={false} axisLine={false} width={32} />,
    <Tooltip
      key="tooltip"
      content={
        <ChartTooltipContent
          labelFormatter={(day) => (typeof day === 'string' ? format.date(localDay(day)) : day)}
        />
      }
    />,
    legend && <Legend key="legend" content={<ChartLegendContent />} />,
  ];
};

/** A mark per `config` key, in its colour, over the days, drawn with the loaded `recharts`. */
const Series = ({
  recharts,
  days,
  config,
  visual,
}: SeriesProps & { recharts: typeof Recharts }) => {
  const { Area, AreaChart, Bar, BarChart, Line, LineChart } = recharts;
  const keys = Object.keys(config);
  // One series is named by its card; a legend tells several apart.
  const axes = useAxes(recharts, keys.length > 1);

  const margin = { top: 8, right: 8, bottom: 0, left: 0 };

  return (
    <ChartContainer config={config} className="aspect-auto h-48 w-full">
      {visual === 'bar' ? (
        <BarChart responsive data={days} margin={margin}>
          {axes}
          {keys.map((key) => (
            <Bar key={key} dataKey={key} fill={`var(--color-${key})`} radius={2} />
          ))}
        </BarChart>
      ) : visual === 'line' ? (
        <LineChart responsive data={days} margin={margin}>
          {axes}
          {keys.map((key) => (
            <Line
              key={key}
              dataKey={key}
              type="monotone"
              stroke={`var(--color-${key})`}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      ) : (
        <AreaChart responsive data={days} margin={margin}>
          {axes}
          {keys.map((key) => (
            <Area
              key={key}
              dataKey={key}
              type="monotone"
              stroke={`var(--color-${key})`}
              fill={`var(--color-${key})`}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
        </AreaChart>
      )}
    </ChartContainer>
  );
};

/** `Series` once recharts loads, with the first chart rather than with the tiles. */
const DaySeries = lazy(async () => {
  const recharts = await import('recharts');

  return { default: (props: SeriesProps) => <Series recharts={recharts} {...props} /> };
});

/**
 * Each day's counts as one area, line or bars per series in `config`, its colour and label, with
 * the days along the bottom. A period with no counts at all says `empty` instead.
 */
export const DayChart = <Key extends string>({
  days,
  config,
  empty,
  visual = 'area',
}: {
  days: ({ day: string } & Record<NoInfer<Key>, string | number>)[];
  config: Record<Key, { label: string; color: string }>;
  empty: string;
  visual?: SeriesVisual;
}) => {
  const keys = Object.keys(config).filter((key): key is Key => key in config);

  if (days.every((day) => keys.every((key) => day[key] === 0))) return <Nothing>{empty}</Nothing>;

  return (
    <Suspense fallback={<Skeleton className="h-48" />}>
      <DaySeries days={days} config={config} visual={visual} />
    </Suspense>
  );
};

/** The chart palette's five colours, a slice each in turn. */
const SLICE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

type SliceProps = { rows: { key: string; name: string; value: number; color?: string | null }[] };

/**
 * A slice per row, its own colour or the palette's next, with a legend, by the loaded `recharts`.
 * Slices go by position, `s0`, `s1`…, as a CSS variable can't be named after any value.
 */
const Slices = ({ recharts, rows }: SliceProps & { recharts: typeof Recharts }) => {
  const { Cell, Legend, Pie, PieChart, Tooltip } = recharts;

  const slices = rows.map((row, index) => ({
    slot: `s${index}`,
    name: row.name,
    value: row.value,
  }));

  const config = Object.fromEntries(
    rows.map((row, index) => [
      `s${index}`,
      { label: row.name, color: row.color ?? SLICE_COLORS[index % SLICE_COLORS.length] ?? '' },
    ]),
  );

  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <PieChart responsive>
        <Tooltip content={<ChartTooltipContent nameKey="slot" hideLabel />} />
        <Pie data={slices} dataKey="value" nameKey="slot" innerRadius="45%" strokeWidth={2}>
          {slices.map((slice) => (
            <Cell key={slice.slot} fill={`var(--color-${slice.slot})`} />
          ))}
        </Pie>
        <Legend content={<ChartLegendContent nameKey="slot" />} />
      </PieChart>
    </ChartContainer>
  );
};

const PieSlices = lazy(async () => {
  const recharts = await import('recharts');

  return { default: (props: SliceProps) => <Slices recharts={recharts} {...props} /> };
});

/** The rows as slices of a ring, or `empty` when none has a count. */
export const PieChart = ({ rows, empty }: SliceProps & { empty: string }) => {
  if (!rows.some((row) => row.value > 0)) return <Nothing>{empty}</Nothing>;

  return (
    <Suspense fallback={<Skeleton className="h-56" />}>
      <PieSlices rows={rows} />
    </Suspense>
  );
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

/**
 * Calls by weekday and hour: a row per weekday, Monday first, a cell per hour, darker the more
 * calls it had. Hovering a cell says how many and how many were answered.
 */
export const Heatmap = ({
  cells,
  empty,
}: {
  cells: { weekday: number; hour: number; total: number; answered: number }[];
  empty: string;
}) => {
  const { t } = useTranslation('frontline');
  const format = useFormat();
  const byCell = new Map(cells.map((cell) => [`${cell.weekday}-${cell.hour}`, cell]));
  const max = Math.max(...cells.map((cell) => cell.total), 1);

  if (cells.length === 0) return <Nothing>{empty}</Nothing>;

  // 1 January 2024 was a Monday, so day `weekday` of it names that weekday.
  const weekdayName = (weekday: number) => format.date(new Date(2024, 0, weekday), 'EEE');

  return (
    <figure
      aria-label={t('calls-by-hour-label', 'Calls by weekday and hour')}
      className="flex flex-col gap-1 text-xs"
    >
      {WEEKDAYS.map((weekday) => (
        <div key={weekday} className="flex items-center gap-2">
          <span className="w-8 shrink-0 text-muted-foreground">{weekdayName(weekday)}</span>
          <div className="grid flex-1 grid-cols-24 gap-0.5">
            {HOURS.map((hour) => {
              const cell = byCell.get(`${weekday}-${hour}`);
              const cssVariables = { '--heat': String((cell?.total ?? 0) / max) };

              return (
                <span
                  key={hour}
                  style={cssVariables}
                  title={t(
                    'calls-in-hour',
                    '{{day}} {{hour}}:00, {{total}} calls, {{answered}} answered',
                    {
                      day: weekdayName(weekday),
                      hour,
                      total: cell?.total ?? 0,
                      answered: cell?.answered ?? 0,
                    },
                  )}
                  className="h-4 rounded-xs bg-muted"
                >
                  <span className="block size-full rounded-xs bg-primary opacity-(--heat)" />
                </span>
              );
            })}
          </div>
        </div>
      ))}
      <div className="flex gap-2 text-muted-foreground">
        <span className="w-8 shrink-0" />
        <div className="grid flex-1 grid-cols-4">
          {[0, 6, 12, 18].map((hour) => (
            <span key={hour}>{`${hour}:00`}</span>
          ))}
        </div>
      </div>
    </figure>
  );
};
