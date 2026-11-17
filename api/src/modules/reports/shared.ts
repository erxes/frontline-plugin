import { and, type Column, gte, lt, type SQL, sql } from 'drizzle-orm';
import { z } from 'zod';

const MAX_DAYS = 366;

/** How many rows a breakdown keeps, largest first. */
export const TOP = 10;

export const Count = z.number().int();

/** A tag and how many of the period's records carry it. */
export const TagCount = z.object({
  tagId: z.string(),
  name: z.string(),
  colorCode: z.string().nullable(),
  count: Count,
});

/** Whether `timeZone` is an IANA name both Intl and Postgres know, such as `Asia/Ulaanbaatar`. */
const isTimeZone = (timeZone: string) => {
  try {
    return new Intl.DateTimeFormat('en', { timeZone }).resolvedOptions().timeZone !== '';
  } catch {
    return false;
  }
};

/**
 * A report's period, `from` up to `to`, and the member's time zone, which draws its days and
 * hours. A year at most.
 */
export const RangeInput = z
  .object({
    from: z.date(),
    to: z.date(),
    timeZone: z.string().refine(isTimeZone, 'Unknown time zone'),
  })
  .refine(({ from, to }) => from < to, 'The period ends before it starts')
  .refine(
    ({ from, to }) => to.getTime() - from.getTime() <= MAX_DAYS * 86_400_000,
    `A report covers ${MAX_DAYS} days at most`,
  );

export type Range = z.output<typeof RangeInput>;

/** Whether `column` falls in the period. */
export const within = (column: Column, { from, to }: Range) =>
  and(gte(column, from), lt(column, to));

/** `column`'s day in the member's time zone, as `YYYY-MM-DD`. Group by its position, `sql\`1\``. */
export const dayOf = (column: Column, { timeZone }: Range) =>
  sql<string>`to_char(${column} at time zone ${timeZone}, 'YYYY-MM-DD')`;

/** A count of the rows where `condition` holds. */
export const countWhere = (condition: SQL | undefined) =>
  sql<number>`count(*) filter (where ${condition ?? sql`true`})`.mapWith(Number);

/** The rounded average of `seconds` over the rows where `condition` holds, or null over none. */
export const averageSeconds = (seconds: SQL | Column, condition?: SQL) =>
  sql<number | null>`round(avg(${seconds}) filter (where ${condition ?? sql`true`}))::int`;

/** Seconds from `start` to `end`. */
export const secondsBetween = (start: Column, end: Column) =>
  sql`extract(epoch from ${end} - ${start})`;

const dayFormat = (timeZone: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });

const nextDay = (day: string) => {
  const date = new Date(`${day}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + 1);

  return date.toISOString().slice(0, 10);
};

/** Every day of the period in the member's time zone, `YYYY-MM-DD`, so a chart's axis has no gaps. */
export const everyDay = ({ from, to, timeZone }: Range) => {
  const format = dayFormat(timeZone);
  const last = format.format(new Date(to.getTime() - 1));
  const days: string[] = [];

  for (let day = format.format(from); day <= last; day = nextDay(day)) days.push(day);

  return days;
};

/** A day's count from rows grouped by `dayOf`, 0 on a day with none. */
export const countOn = (rows: { day: string; count: number }[]) => {
  const counts = new Map(rows.map(({ day, count }) => [day, count]));

  return (day: string) => counts.get(day) ?? 0;
};
