import type { ConditionGroup } from '@erxes/core-contract';
import { index, jsonb, text, timestamp } from 'drizzle-orm/pg-core';
import { id, stamps, table } from './table.ts';

/** The report pages a chart shows on. */
export const REPORT_SECTIONS = ['conversations', 'tickets', 'meta', 'calls'] as const;

/** How a chart draws its numbers. */
export const REPORT_VISUALS = ['area', 'line', 'bar', 'pie', 'heatmap', 'table'] as const;

/**
 * The periods a chart offers: the last 7, 30 or 90 days, a calendar day, week, month or year,
 * or `custom`, from `from` to `to`.
 */
export const REPORT_PERIODS = [
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
] as const;

/**
 * A chart a member saved on a report page with its own filter, period and look, which every
 * member of the organisation sees there, as the old page's saved charts were.
 */
export const reportCharts = table(
  'report_charts',
  {
    id: id(),
    orgId: text().notNull(),
    name: text().notNull(),
    section: text({ enum: REPORT_SECTIONS }).notNull(),
    /** The card it copies, such as `conversations-by-source`. */
    kind: text().notNull(),
    visual: text({ enum: REPORT_VISUALS }).notNull(),
    period: text({ enum: REPORT_PERIODS }).notNull(),
    /** A `custom` period's bounds. */
    from: timestamp({ withTimezone: true }),
    to: timestamp({ withTimezone: true }),
    /** Core's condition group on the paths of the list of what the chart counts. */
    filter: jsonb().$type<ConditionGroup>(),
    /** The custom field a "Tickets by property" chart counts by. */
    fieldId: text(),
    ...stamps(),
  },
  (t) => [
    index('frontline_report_charts_org_section_created_idx').on(t.orgId, t.section, t.createdAt),
  ],
);
