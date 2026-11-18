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
import { type ReactNode, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { PLUGIN } from '~/plugin.ts';
import css from './styles.css?inline';

addPluginStyles(`${PLUGIN}:reports`, css);

/** The periods a tile offers, in days back from now. */
const PERIODS = ['7', '30', '90'] as const;

type Period = (typeof PERIODS)[number];

const DAY = 86_400_000;

const isPeriod = (value: string | undefined): value is Period =>
  PERIODS.some((period) => period === value);

/** The end of the current minute, so what happened seconds ago counts. */
const minuteEnd = () => {
  const end = new Date();

  end.setSeconds(60, 0);

  return end.getTime();
};

/** Each tile's period, by its widget name, kept in this browser. */
const tilePeriod = storedFamily({
  key: `${PLUGIN}:tile-period`,
  schema: z.enum(PERIODS),
  initial: '30',
});

/**
 * The last 30, 7 or 90 days to the end of the minute the tile mounted, in the browser's time
 * zone; the tile named `tile` keeps its pick. Tiles on the same period share one request.
 */
export const usePeriod = (tile: string) => {
  const [days, setDays] = useAtom(tilePeriod(tile));
  const [to] = useState(minuteEnd);

  const range = useMemo(
    () => ({
      from: new Date(to - Number(days) * DAY),
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
 * A report tile's body under core's header: the period toggle, then the report once it loads,
 * a skeleton before, or the API's message when it fails, such as a missing permission.
 */
export const Tile = <Report,>({
  period,
  query,
  controls,
  children,
}: {
  /** None for a tile that counts what holds now. */
  period?: PeriodState;
  query: UseQueryResult<Report>;
  /** Pickers before the period, such as the pipeline a ticket tile counts. */
  controls?: ReactNode;
  children: (report: Report) => ReactNode;
}) => (
  <div className="flex h-full flex-col gap-3 p-3">
    <div className="flex items-center justify-end gap-2 empty:hidden">
      {controls}
      {period && <PeriodToggle {...period} />}
    </div>
    {query.error ? (
      <p role="alert" className="text-sm text-destructive">
        {query.error.message}
      </p>
    ) : query.data === undefined ? (
      <Skeleton className="h-24" />
    ) : (
      children(query.data)
    )}
  </div>
);

/** A headline number with what it counts, and an optional note under it. */
export const Stat = ({ label, value, hint }: { label: string; value: string; hint?: string }) => (
  <div className="flex min-w-32 flex-1 flex-col gap-1">
    <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
    <span className="text-xl font-semibold tabular-nums">{value}</span>
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
  rows: { key: string; lead: ReactNode; numbers: string[] }[];
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
