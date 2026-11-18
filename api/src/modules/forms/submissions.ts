import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, count, eq, getTableColumns, inArray, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { formAnswers, formFields, formSubmissions } from '#/db/forms.ts';
import { reads, writes } from '#/orpc.ts';
import { FilterInput, type FilterFields, filterSql, likeText } from '../filter.ts';
import { orderOf, PageInput } from '../paging.ts';
import { Answer, typeError } from './answers.ts';
import { Ids } from '../fields.ts';
import { formFor, formsFor } from './shared.ts';

const { orgId, ...submissionColumns } = getTableColumns(formSubmissions);

export const Submission = createSelectSchema(formSubmissions)
  .omit({ orgId: true })
  .extend({ answers: z.record(z.string(), z.unknown()) });

/**
 * Submissions with their answers by field id, joined in laterally: a correlated subquery in a
 * one-table select loses its table names, so it would compare the answer's own id.
 */
const submissionRows = (tx: Tx) => {
  const answered = tx
    .select({
      answers: sql<Record<string, unknown>>`coalesce(
        jsonb_object_agg(${formAnswers.fieldId}, ${formAnswers.value}), '{}'::jsonb
      )`.as('answers'),
    })
    .from(formAnswers)
    .where(eq(formAnswers.submissionId, formSubmissions.id))
    .as('answered');

  return tx
    .select({ ...submissionColumns, answers: answered.answers })
    .from(formSubmissions)
    .leftJoinLateral(answered, sql`true`)
    .$dynamic();
};

/** One field's answer as text, for the filter bar and search. */
const answerText = (fieldId: string) => sql`(
  select ${formAnswers.value} #>> '{}' from ${formAnswers}
  where ${formAnswers.submissionId} = ${formSubmissions.id} and ${formAnswers.fieldId} = ${fieldId}
)`;

/**
 * What the submissions list's filter bar narrows by: when it came, whether it found a customer,
 * and each of the form's fields as `subject.answer.<field id>`.
 */
const filterFields = async (tx: Tx, formId: string): Promise<FilterFields> => {
  const fields = await tx
    .select({ id: formFields.id })
    .from(formFields)
    .where(eq(formFields.formId, formId));

  return {
    'subject.createdAt': { kind: 'date', expr: formSubmissions.createdAt },
    'subject.customerId': { kind: 'text', expr: formSubmissions.customerId },
    ...Object.fromEntries(
      fields.map((field) => [
        `subject.answer.${field.id}`,
        { kind: 'text' as const, expr: answerText(field.id) },
      ]),
    ),
  };
};

/** The submission of `id` and its form, which the caller reads or, with `change`, changes. */
const submissionFor = async (tx: Tx, member: PluginMember, id: string, change: boolean) => {
  const [row] = await submissionRows(tx).where(eq(formSubmissions.id, id));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such submission' });

  await formFor(tx, member, row.formId, change);

  return row;
};

const order = orderOf(formSubmissions);

/**
 * A form's submissions, newest first, `limit` at a time, narrowed by the filter bar; `search`
 * matches any answer's text, ignoring case.
 */
const list = reads(PERMISSIONS.channelView)
  .input(z.object({ formId: z.string(), ...FilterInput, ...PageInput }))
  .output(
    z.object({
      submissions: z.array(Submission),
      nextCursor: z.string().nullable(),
      totalCount: z.number(),
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    await formFor(tx, member, input.formId, false);

    const matches = and(
      eq(formSubmissions.formId, input.formId),
      input.search
        ? sql`exists (
            select 1 from ${formAnswers}
            where ${formAnswers.submissionId} = ${formSubmissions.id}
              and ${formAnswers.value}::text ilike ${likeText(input.search)}
          )`
        : undefined,
      input.filter
        ? filterSql(await filterFields(tx, input.formId), input.filter, member.userId)
        : undefined,
    );

    const rows = await submissionRows(tx)
      .where(and(matches, order.after(input.cursor)))
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const [total] = await tx.select({ value: count() }).from(formSubmissions).where(matches);
    const { items, nextCursor } = await order.page(tx, rows, input.limit);

    return { submissions: items, nextCursor, totalCount: total?.value ?? 0 };
  });

/** One submission with its answers. */
const get = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Submission)
  .handler(async ({ input, context: { tx, member } }) =>
    submissionFor(tx, member, input.id, false),
  );

/** Corrects one answer, checked against its field's type; `null` clears it. */
const update = writes(PERMISSIONS.channelView)
  .input(z.object({ id: z.string(), fieldId: z.string(), value: Answer.nullable() }))
  .output(Submission)
  .handler(async ({ input, context: { tx, member } }) => {
    const submission = await submissionFor(tx, member, input.id, true);

    const [field] = await tx
      .select()
      .from(formFields)
      .where(and(eq(formFields.id, input.fieldId), eq(formFields.formId, submission.formId)));

    if (!field) throw new ORPCError('NOT_FOUND', { message: 'No such field' });

    const where = and(
      eq(formAnswers.submissionId, input.id),
      eq(formAnswers.fieldId, input.fieldId),
    );

    if (input.value === null || input.value === '') {
      await tx.delete(formAnswers).where(where);
    } else {
      const message = typeError(field, input.value);

      if (message) throw new ORPCError('BAD_REQUEST', { message });

      await tx
        .insert(formAnswers)
        .values({
          orgId: member.orgId,
          submissionId: input.id,
          fieldId: input.fieldId,
          value: input.value,
        })
        .onConflictDoUpdate({
          target: [formAnswers.orgId, formAnswers.submissionId, formAnswers.fieldId],
          set: { value: input.value },
        });
    }

    return submissionFor(tx, member, input.id, false);
  });

/** Deletes the submissions with their answers: all of them, or none when one is refused. */
const remove = writes(PERMISSIONS.channelView)
  .input(z.object({ ids: Ids }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    const rows = await tx
      .select({ formId: formSubmissions.formId })
      .from(formSubmissions)
      .where(inArray(formSubmissions.id, input.ids));

    if (rows.length !== input.ids.length)
      throw new ORPCError('NOT_FOUND', { message: 'No such submission' });

    await formsFor(tx, member, [...new Set(rows.map((row) => row.formId))], true);

    const removed = await tx
      .delete(formSubmissions)
      .where(inArray(formSubmissions.id, input.ids))
      .returning({ id: formSubmissions.id });

    return { ids: removed.map((row) => row.id) };
  });

export const submissionProcedures = { list, get, update, remove };
