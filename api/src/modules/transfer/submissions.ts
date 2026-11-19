import type { PluginExportRequest } from '@erxes/core-contract';
import { compileFilter } from '@erxes/plugin-sdk/filter';
import { ORPCError } from '@orpc/server';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { type Tx, withOrg } from '#/db/client.ts';
import { formAnswers, formFields, forms, formSubmissions } from '#/db/forms.ts';
import { channelMembers } from '#/db/schema.ts';
import { askedMember, membership } from '../channels/access.ts';
import { FILE_FIELDS, typeError } from '../forms/answers.ts';
import { answered, SUBMISSION_FILTER, submissionRows } from '../forms/submissions.ts';
import { orderOf } from '../paging.ts';
import { customersOf, namesOf } from './people.ts';
import {
  dateOf,
  type ImportRequest,
  labelledOf,
  refuse,
  rowOf,
  runImport,
  tickOf,
} from './shared.ts';

/**
 * Submissions' columns in core's import and export. Forms ask different questions, so the
 * answers share one column: `Question: answer` for each, `; ` between them.
 */
export const SUBMISSION_COLUMNS = [
  { key: 'id', label: 'ID', default: false },
  { key: 'form', label: 'Form', aliases: ['Form name', 'Маягт'] },
  { key: 'customer', label: 'Customer', aliases: ['Customer email'] },
  { key: 'answers', label: 'Answers', aliases: ['Хариулт'] },
  { key: 'submittedAt', label: 'Submitted', aliases: ['Created', 'Date'] },
];

/** An answer as one cell's text: picks and files by name, a tick as yes or no. */
const answerText = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(answerText).join(', ');

  if (typeof value === 'boolean') return value ? 'yes' : 'no';

  if (typeof value === 'object' && value !== null && 'name' in value) return String(value.name);

  return String(value);
};

/** The forms of `ids` with their fields in the form's order. */
const formsWithFields = async (tx: Tx, ids: string[]) => {
  if (!ids.length) return [];

  const fields = await tx
    .select()
    .from(formFields)
    .where(inArray(formFields.formId, ids))
    .orderBy(asc(formFields.order));

  const rows = await tx
    .select({ id: forms.id, name: forms.name })
    .from(forms)
    .where(inArray(forms.id, ids));

  return rows.map((form) => ({
    ...form,
    fields: fields.filter((field) => field.formId === form.id),
  }));
};

/** The submissions of the forms in the member's channels, oldest first, as their search narrows. */
export const exportSubmissions = async (request: z.infer<typeof PluginExportRequest>) => {
  const member = askedMember(request.orgId, request.userId);
  const order = orderOf(formSubmissions, formSubmissions.createdAt, true);
  const { search, filter } = request.query;

  const { items, nextCursor, formList } = await withOrg(request.orgId, async (tx) => {
    const rows = await submissionRows(tx)
      .innerJoin(forms, eq(forms.id, formSubmissions.formId))
      .innerJoin(channelMembers, membership(member, forms.channelId))
      .where(
        and(
          search ? answered(search) : undefined,
          compileFilter(SUBMISSION_FILTER, filter ?? undefined, { me: member.userId }),
          order.after(request.cursor ?? undefined),
        ),
      )
      .orderBy(...order.orderBy)
      .limit(request.limit + 1);

    const page = await order.page(tx, rows, request.limit);

    return {
      ...page,
      formList: await formsWithFields(tx, [...new Set(page.items.map((row) => row.formId))]),
    };
  });

  const nameOf = await namesOf(request.orgId, {
    users: [],
    customers: items.flatMap((row) => row.customerId ?? []),
    companies: [],
  });

  return {
    cursor: nextCursor,
    rows: items.map((row) => {
      const form = formList.find((one) => one.id === row.formId);

      return rowOf(request.columns, {
        id: row.id,
        form: form?.name ?? row.formId,
        customer: nameOf(row.customerId),
        answers: (form?.fields ?? []).flatMap((field) =>
          field.id in row.answers ? [`${field.label}: ${answerText(row.answers[field.id])}`] : [],
        ),
        submittedAt: row.createdAt.toISOString(),
      });
    }),
  };
};

type Field = Awaited<ReturnType<typeof formsWithFields>>[number]['fields'][number];

/** One answer from its text, by its field's type, as the form's own checks take it. */
const answerOf = (field: Field, text: string) => {
  if (field.type === 'boolean') return tickOf(text, field.label);

  if (field.type === 'number' && text && !Number.isNaN(Number(text))) return Number(text);

  return field.type === 'check' ? text.split(/,\s*/).filter(Boolean) : text;
};

/**
 * A row's answers by field id, from `Question: answer` parts, each fitting its field as the
 * widget's would. A part starts at a question the form asks, so an answer may hold `; `. A
 * file's answer is left out, as a cell holds only its name, and the row's other answers stay.
 */
const answersOf = (cell: string, fields: Field[]) =>
  Object.fromEntries(
    labelledOf(cell, fields).flatMap(({ item, text }) => {
      if (!text || FILE_FIELDS.has(item.type)) return [];

      const answer = answerOf(item, text);
      const error = typeError(item, answer);

      if (error) throw refuse(`${item.label}: ${error}`);

      return [[item.id, answer]];
    }),
  );

/**
 * Adds a submission for each row to a form in the member's channels, by name or id, with its
 * answers, typed and checked as the form checks a visitor's, customer (by email, made in core
 * when it has none, not in a check) and date. It fires no automation, as an old answer
 * shouldn't send mail today. Submissions are only added: a row whose ID the member already
 * has is skipped, so an export imports again without doubling.
 */
export const importSubmissions = async (request: ImportRequest) => {
  const member = askedMember(request.orgId, request.userId);

  const customerOf = await customersOf(
    request.orgId,
    request.rows.flatMap((row) => row.values.customer ?? []),
    request.dryRun,
  );

  return runImport(request, async (tx, row) => {
    const [found] = row.id
      ? await tx
          .select({ id: formSubmissions.id })
          .from(formSubmissions)
          .innerJoin(forms, eq(forms.id, formSubmissions.formId))
          .innerJoin(channelMembers, membership(member, forms.channelId))
          .where(eq(formSubmissions.id, row.id))
      : [];

    if (found || request.mode === 'update') return { action: 'skip', recordId: found?.id };

    if (!row.form) throw refuse('Form is required');

    const named = await tx
      .select({ id: forms.id })
      .from(forms)
      .innerJoin(channelMembers, membership(member, forms.channelId))
      .where(or(eq(forms.id, row.form), sql`lower(${forms.name}) = lower(${row.form})`));

    if (named.length > 1) throw refuse(`${named.length} forms are named ${row.form}; use its ID`);

    const [form] = await formsWithFields(
      tx,
      named.map((one) => one.id),
    );

    if (!form) throw refuse(`No form ${row.form} in your channels`);

    const answers = Object.entries(answersOf(row.answers ?? '', form.fields));

    const [saved] = await tx
      .insert(formSubmissions)
      .values({
        orgId: request.orgId,
        formId: form.id,
        customerId: row.customer ? customerOf(row.customer) : undefined,
        createdAt: dateOf(row.submittedAt, 'Submitted'),
      })
      .returning({ id: formSubmissions.id });

    if (!saved) throw new ORPCError('INTERNAL_SERVER_ERROR');

    if (answers.length)
      await tx.insert(formAnswers).values(
        answers.map(([fieldId, value]) => ({
          orgId: request.orgId,
          submissionId: saved.id,
          fieldId,
          value,
        })),
      );

    return { action: 'create', recordId: saved.id };
  });
};
