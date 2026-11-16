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

type AreasProps = {
  days: { day: string }[];
  config: Record<string, { label: string; color: string }>;
};

/** An area per `config` key, in its colour, over the days, drawn with the loaded `recharts`. */
const Areas = ({ recharts, days, config }: AreasProps & { recharts: typeof Recharts }) => {
  const { Area, AreaChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } = recharts;
  const format = useFormat();

  return (
    <ChartContainer config={config} className="aspect-auto h-48 w-full">
      <AreaChart responsive data={days} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          tickFormatter={(day: string) => format.date(localDay(day), 'MMM d')}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={32} />
        <Tooltip
          content={
            <ChartTooltipContent
              labelFormatter={(day) => (typeof day === 'string' ? format.date(localDay(day)) : day)}
            />
          }
        />
        <Legend content={<ChartLegendContent />} />
        {Object.keys(config).map((key) => (
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
    </ChartContainer>
  );
};

/** `Areas` once recharts loads, with the first chart rather than with the tiles. */
const DayAreas = lazy(async () => {
  const recharts = await import('recharts');

  return { default: (props: AreasProps) => <Areas recharts={recharts} {...props} /> };
});

/**
 * Each day's counts as one area per series in `config`, its colour and label, with the days
 * along the bottom. A period with no counts at all says `empty` instead.
 */
export const DayChart = <Key extends string>({
  days,
  config,
  empty,
}: {
  days: ({ day: string } & Record<NoInfer<Key>, number>)[];
  config: Record<Key, { label: string; color: string }>;
  empty: string;
}) => {
  const keys = Object.keys(config).filter((key): key is Key => key in config);

  if (days.every((day) => keys.every((key) => day[key] === 0))) return <Nothing>{empty}</Nothing>;

  return (
    <Suspense fallback={<Skeleton className="h-48" />}>
      <DayAreas days={days} config={config} />
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
