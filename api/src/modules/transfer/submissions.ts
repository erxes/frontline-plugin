import type { PluginExportRequest } from '@erxes/core-contract';
import { compileFilter } from '@erxes/plugin-sdk/filter';
import { ORPCError } from '@orpc/server';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { type Tx, withOrg } from '#/db/client.ts';
import { formAnswers, formFields, forms, formSubmissions } from '#/db/forms.ts';
import { channelMembers } from '#/db/schema.ts';
import { membership } from '../channels/access.ts';
import { answered, SUBMISSION_FILTER, submissionRows } from '../forms/submissions.ts';
import { orderOf } from '../paging.ts';
import { customersByEmail, namesOf } from './people.ts';
import { dateOf, type ImportRequest, rowOf, runImport, transferMember } from './shared.ts';

/**
 * Submissions' columns in core's import and export. Forms ask different questions, so the
 * answers share one column: `Question: answer` for each, `; ` between them.
 */
export const SUBMISSION_COLUMNS = [
  { key: 'id', label: 'ID', default: false, importable: false },
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
    .select({
      id: formFields.id,
      formId: formFields.formId,
      label: formFields.label,
      type: formFields.type,
    })
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
  const member = transferMember(request.orgId, request.userId);
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

const refuse = (message: string) => new ORPCError('BAD_REQUEST', { message });

type Field = Awaited<ReturnType<typeof formsWithFields>>[number]['fields'][number];

/**
 * A row's answers by field id, from `Question: answer` parts: a part starts at a question the
 * form asks, so an answer may hold `; ` itself. A tick box's answer is its picks.
 */
const answersOf = (cell: string, fields: Field[]) => {
  const labels = fields.filter((field) => field.label).map((field) => field.label);

  const starts = [...cell.matchAll(/(?:^|;\s*|\n)([^:;\n]+):\s*/g)].filter((match) =>
    labels.includes(match[1]?.trim() ?? ''),
  );

  if (cell.trim() && !starts.length) throw refuse('Write each answer as Question: answer');

  return Object.fromEntries(
    starts.map((match, at) => {
      const label = match[1]?.trim();
      const field = fields.find((one) => one.label === label);
      const end = starts[at + 1]?.index ?? cell.length;
      const text = cell.slice((match.index ?? 0) + match[0].length, end).trim();

      return [field?.id ?? '', field?.type === 'check' ? text.split(/,\s*/).filter(Boolean) : text];
    }),
  );
};

/**
 * Adds a submission for each row to a form in the member's channels, by name or id, with its
 * answers, customer (by email, made in core when it has none, not in a check) and date. It
 * fires no automation, as an old answer shouldn't send mail today. Submissions are only added:
 * an update finds nothing to change.
 */
export const importSubmissions = async (request: ImportRequest) => {
  const member = transferMember(request.orgId, request.userId);

  const customers = request.dryRun
    ? new Map<string, string>()
    : await customersByEmail(
        request.orgId,
        request.rows.flatMap((row) => row.values.customer ?? []),
      );

  return runImport(request, async (tx, row) => {
    if (request.mode === 'update') return { action: 'skip' };

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
        customerId: row.customer ? customers.get(row.customer.toLowerCase()) : undefined,
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
