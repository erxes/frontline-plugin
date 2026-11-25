import { ConditionGroup } from '@erxes/core-contract';
import { ORPCError } from '@orpc/server';
import { asc, eq } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { REPORT_PERIODS, REPORT_SECTIONS, REPORT_VISUALS, reportCharts } from '#/db/reports.ts';
import { reads, writes } from '#/orpc.ts';

const Chart = createSelectSchema(reportCharts, {
  section: z.enum(REPORT_SECTIONS),
  visual: z.enum(REPORT_VISUALS),
  period: z.enum(REPORT_PERIODS),
  filter: () => ConditionGroup.nullable(),
}).omit({ orgId: true });

/** What a chart holds besides its name: the card it copies and how it narrows and draws it. */
const Look = z.object({
  visual: z.enum(REPORT_VISUALS),
  period: z.enum(REPORT_PERIODS),
  from: z.date().nullable().optional(),
  to: z.date().nullable().optional(),
  filter: ConditionGroup.nullable().optional(),
  fieldId: z.string().min(1).nullable().optional(),
});

const Name = z.string().trim().min(1).max(200);

/** A custom period needs both of its bounds, the start first. */
const boundedPeriod = (look: { period: string; from?: Date | null; to?: Date | null }) =>
  look.period !== 'custom' || (!!look.from && !!look.to && look.from < look.to);

const PERIOD_MESSAGE = 'A custom period needs a start before its end';

/** The organisation's saved charts on one report page, the oldest first. */
const list = reads(PERMISSIONS.channelView)
  .route({ summary: 'List the saved charts on one report page, oldest first' })
  .input(z.object({ section: z.enum(REPORT_SECTIONS) }))
  .output(z.array(Chart))
  .handler(({ input, context: { tx } }) =>
    tx
      .select()
      .from(reportCharts)
      .where(eq(reportCharts.section, input.section))
      .orderBy(asc(reportCharts.createdAt), asc(reportCharts.id)),
  );

/** Saves a card as a chart every member sees on its page. */
const create = writes(PERMISSIONS.channelView)
  .route({
    summary:
      'Save a report card as a chart every member sees on its page; a custom period needs from before to',
  })
  .input(
    Look.extend({ name: Name, section: z.enum(REPORT_SECTIONS), kind: z.string().min(1) }).refine(
      boundedPeriod,
      PERIOD_MESSAGE,
    ),
  )
  .output(Chart)
  .handler(async ({ input, context: { tx, member } }) => {
    const [row] = await tx
      .insert(reportCharts)
      .values({ ...input, orgId: member.orgId, createdBy: member.userId })
      .returning();

    if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return row;
  });

/** Renames a chart or changes how it narrows and draws its card. */
const update = writes(PERMISSIONS.channelView)
  .route({ summary: 'Rename a saved chart or change its period, filter or look' })
  .input(Look.partial().extend({ id: z.string(), name: Name.optional() }))
  .output(Chart)
  .handler(async ({ input: { id, ...patch }, context: { tx } }) => {
    const [current] = await tx.select().from(reportCharts).where(eq(reportCharts.id, id));

    if (!current) throw new ORPCError('NOT_FOUND', { message: 'No such chart' });

    if (!boundedPeriod({ ...current, ...patch }))
      throw new ORPCError('BAD_REQUEST', { message: PERIOD_MESSAGE });

    const [row] = await tx
      .update(reportCharts)
      .set(patch)
      .where(eq(reportCharts.id, id))
      .returning();

    if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such chart' });

    return row;
  });

/** Takes a chart off its page for everyone. */
const remove = writes(PERMISSIONS.channelView)
  .route({ summary: 'Remove a saved chart from its report page for everyone' })
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }))
  .handler(async ({ input, context: { tx } }) => {
    const [row] = await tx
      .delete(reportCharts)
      .where(eq(reportCharts.id, input.id))
      .returning({ id: reportCharts.id });

    if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such chart' });

    return row;
  });

export const chartProcedures = { list, create, update, remove };
