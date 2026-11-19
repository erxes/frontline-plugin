import type { UseQueryResult } from '@tanstack/react-query';
import {
  addPluginStyles,
  localTimeZone,
  Skeleton,
  storedFamily,
  Table,
  ToggleGroup,
  Tooltip,
  useFormat,
} from 'erxes-ui';
import { useAtom } from 'jotai';
import { type ReactNode, useMemo, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { PLUGIN } from '~/plugin.ts';
import { RetryButton } from '~/shared/List.tsx';
import css from './styles.css?inline';
import { type PickState, TilePick } from './TilePick.tsx';

addPluginStyles(`${PLUGIN}:reports`, css);

/** The periods a tile offers, in days back from now. */
const PERIODS = ['7', '30', '90'] as const;

type Period = (typeof PERIODS)[number];

const isPeriod = (value: string | undefined): value is Period =>
  PERIODS.some((period) => period === value);

/** The end of the current minute, so what happened seconds ago counts. */
const minuteEnd = () => {
  const end = new Date();

  end.setSeconds(60, 0);

  return end.getTime();
};

/** Wakes React every 10 s; `minuteEnd` only changes once a minute, so tiles move then. */
const everyFewSeconds = (tick: () => void) => {
  const timer = setInterval(tick, 10_000);

  return () => clearInterval(timer);
};

/** Each tile's period, by its widget name, kept in this browser. */
const tilePeriod = storedFamily({
  key: `${PLUGIN}:tile-period`,
  schema: z.enum(PERIODS),
  initial: '30',
});

/** The start of the day `days - 1` days before `to`, in the browser's time zone. */
const firstDay = (to: number, days: number) => {
  const from = new Date(to);

  from.setHours(0, 0, 0, 0);
  from.setDate(from.getDate() - days + 1);

  return from;
};

/**
 * The last 30, 7 or 90 calendar days, today's to the end of the current minute, in the browser's
 * time zone, so a dashboard left open keeps counting and a list of the same days shows the same
 * tickets; the tile named `tile` keeps its pick. Tiles on the same period share one request.
 */
export const usePeriod = (tile: string) => {
  const [days, setDays] = useAtom(tilePeriod(tile));
  const to = useSyncExternalStore(everyFewSeconds, minuteEnd);

  const range = useMemo(
    () => ({
      from: firstDay(to, Number(days)),
      to: new Date(to),
      timeZone: localTimeZone() ?? 'UTC',
    }),
    [to, days],
  );

  return { days, setDays, range };
};

type PeriodState = ReturnType<typeof usePeriod>;

/** 7d, 30d or 90d, pressed one at a time. */
const PeriodToggle = ({ days, setDays }: PeriodState) => {
  const { t } = useTranslation('frontline');

  return (
    <ToggleGroup
      value={[days]}
      onValueChange={([value]) => {
        if (isPeriod(value)) setDays(value);
      }}
      size="sm"
      variant="outline"
      aria-label={t('report-period', 'Period')}
    >
      {PERIODS.map((period) => (
        <ToggleGroup.Item
          key={period}
          value={period}
          aria-label={t('last-days', 'Last {{count}} days', { count: Number(period) })}
        >
          {t('days-short', '{{count}}d', { count: Number(period) })}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup>
  );
};

/**
 * A report tile's body under core's header: what it counts, a pipeline or channel, and the period
 * toggle, then the report once it loads, a skeleton before, or the API's message when it fails,
 * such as a missing permission.
 */
export const Tile = <Report,>({
  period,
  pick,
  query,
  children,
}: {
  /** None for a tile that counts what holds now. */
  period?: PeriodState;
  pick?: PickState;
  query: UseQueryResult<Report>;
  children: (report: Report) => ReactNode;
}) => (
  <div className="flex h-full flex-col gap-3 p-3">
    <div className="flex items-center justify-end gap-2 empty:hidden">
      {pick && <TilePick pick={pick} />}
      {period && <PeriodToggle {...period} />}
    </div>
    {query.error ? (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-sm text-destructive">{query.error.message}</p>
        <RetryButton error={query.error} />
      </div>
    ) : query.data === undefined ? (
      <Skeleton className="h-24" />
    ) : (
      children(query.data)
    )}
  </div>
);

/** A number that opens the list of what it counts, when `to` names one; `label` names what. */
export const Count = ({ value, to, label }: { value: string; to?: string; label?: string }) =>
  to ? (
    <Link to={to} aria-label={label && `${label}: ${value}`} className="hover:underline">
      {value}
    </Link>
  ) : (
    value
  );

/** A headline number with what it counts, and an optional note under it. */
export const Stat = ({
  label,
  value,
  hint,
  to,
}: {
  label: string;
  value: string;
  hint?: string;
  to?: string;
}) => (
  <div className="flex min-w-32 flex-1 flex-col gap-1">
    <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
    <span className="text-xl font-semibold tabular-nums">
      <Count value={value} to={to} label={label} />
    </span>
    {hint && <span className="truncate text-xs text-muted-foreground">{hint}</span>}
  </div>
);

/** A row of `Stat`s that wraps as the tile narrows. */
export const Stats = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-wrap gap-4">{children}</div>
);

/** What a tile says when the period has nothing to count. */
export const Nothing = ({ children }: { children: ReactNode }) => (
  <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
);

export type BarRow = {
  key: string;
  label: ReactNode;
  name: string;
  value: number;
  color?: string | null;
  /** The list of what the row counts. */
  to?: string;
};

/**
 * Rows of "label, count, bar", the bar's length against the largest. A row's `color`, such as a
 * tag's, marks it with a dot. Hover or focus names the row in full.
 */
export const BarList = ({ rows, empty }: { rows: BarRow[]; empty: string }) => {
  const format = useFormat();
  const max = Math.max(...rows.map((row) => row.value), 1);

  if (rows.length === 0) return <Nothing>{empty}</Nothing>;

  return (
    <ul className="flex flex-col gap-2 text-sm">
      {rows.map((row) => {
        const cssVariables = {
          '--bar-width': `${Math.max((row.value / max) * 100, row.value ? 2 : 0)}%`,
          '--dot-color': row.color ?? 'var(--muted-foreground)',
        };

        return (
          <li key={row.key} style={cssVariables} className="flex items-center gap-3">
            <span className="flex w-2/5 min-w-0 items-center gap-2">
              {row.color && <span className="size-2 shrink-0 rounded-full bg-(--dot-color)" />}
              <span className="truncate">{row.label}</span>
            </span>
            <Tooltip>
              <Tooltip.Trigger
                delay={100}
                render={row.to ? <Link to={row.to} /> : undefined}
                aria-label={`${row.name}: ${format.number(row.value)}`}
                className="flex h-5 min-w-0 flex-1"
              >
                <span className="flex flex-1 items-center gap-2">
                  <span className="w-10 shrink-0 text-left tabular-nums">
                    {format.number(row.value)}
                  </span>
                  <span className="h-2.5 flex-1">
                    <span className="block h-full w-(--bar-width) rounded-r bg-primary" />
                  </span>
                </span>
              </Tooltip.Trigger>
              <Tooltip.Content>{row.name}</Tooltip.Content>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
};

/** A share as a percent with one decimal, "–" without one. */
export const percentText = (share: number | null) =>
  share === null ? '–' : `${Math.round(share * 1000) / 10}%`;

/** `part` as a percent of `whole`, "–" of none. */
export const shareOf = (part: number, whole: number) => percentText(whole ? part / whole : null);

const round = (value: number) => Math.round(value * 10) / 10;

/** How long an average took, in the largest unit that reads well: "45 s", "12 min", "3.5 h", "2.1 d". */
export const useSpanText = () => {
  const { t } = useTranslation('frontline');

  return (seconds: number | null) => {
    if (seconds === null) return '–';

    if (seconds < 60) return t('span-seconds', '{{count}} s', { count: Math.round(seconds) });

    if (seconds < 3600)
      return t('span-minutes', '{{count}} min', { count: Math.round(seconds / 60) });

    if (seconds < 86_400) return t('span-hours', '{{count}} h', { count: round(seconds / 3600) });

    return t('span-days', '{{count}} d', { count: round(seconds / 86_400) });
  };
};

/** A small table of a tile's rows: who or what each row is, then its numbers on the right. */
export const MiniTable = ({
  heads: [lead, ...numbers],
  rows,
  empty,
}: {
  heads: [string, ...string[]];
  rows: { key: string; lead: ReactNode; numbers: ReactNode[] }[];
  empty: string;
}) => {
  if (rows.length === 0) return <Nothing>{empty}</Nothing>;

  return (
    <Table>
      <Table.Header>
        <Table.Row>
          <Table.Head>{lead}</Table.Head>
          {numbers.map((head) => (
            <Table.Head key={head} className="text-right">
              {head}
            </Table.Head>
          ))}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((row) => (
          <Table.Row key={row.key}>
            <Table.Cell>{row.lead}</Table.Cell>
            {row.numbers.map((value, index) => (
              <Table.Cell key={numbers[index]} className="text-right">
                <span className="tabular-nums">{value}</span>
              </Table.Cell>
            ))}
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  );
};
