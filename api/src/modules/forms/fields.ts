import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, eq, getTableColumns, gt, inArray, sql } from 'drizzle-orm';
import { createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { FIELD_TYPES, FieldLogic, FieldValidator, formFields, forms } from '#/db/forms.ts';
import { reads, writes } from '#/orpc.ts';
import { isPattern } from './answers.ts';
import { Ids } from '../fields.ts';
import { formFor } from './shared.ts';

const { orgId, ...fieldColumns } = getTableColumns(formFields);

export const FormField = createSelectSchema(formFields, {
  validator: () => FieldValidator.nullable(),
  logics: () => z.array(FieldLogic),
}).omit({ orgId: true });

/** What a field's settings accept; each is optional on an update. */
const FieldInput = createUpdateSchema(formFields, {
  type: () => z.enum(FIELD_TYPES),
  label: (label) => label.trim().max(200),
  description: (text) => text.trim().max(1000),
  placeholder: (text) => text.trim().max(200),
  options: () => z.array(z.string().trim().min(1).max(200)).max(300),
  column: (column) => column.min(1).max(2),
  validator: () =>
    FieldValidator.refine(
      (validator) => validator.type !== 'custom' || isPattern(validator.pattern),
      'The pattern is not a valid regular expression',
    ).nullable(),
  logics: () => z.array(FieldLogic).max(20),
}).pick({
  type: true,
  label: true,
  description: true,
  placeholder: true,
  options: true,
  isRequired: true,
  allowSearch: true,
  column: true,
  validator: true,
  logicAction: true,
  logics: true,
});

/** The form's fields, step by step, in order. */
const fieldsOf = (tx: Tx, formId: string) =>
  tx
    .select(fieldColumns)
    .from(formFields)
    .where(eq(formFields.formId, formId))
    .orderBy(asc(formFields.pageNumber), asc(formFields.order), asc(formFields.createdAt));

/** A step number of the form: 1 up to how many steps it has. */
const checkStep = (steps: number, pageNumber: number) => {
  if (pageNumber > Math.max(steps, 1))
    throw new ORPCError('BAD_REQUEST', { message: 'The form has no such step' });
};

/** Refuses show and hide rules on fields the form doesn't have, or on the field itself. */
const checkLogics = async (tx: Tx, formId: string, fieldId: string | null, logics: unknown[]) => {
  const parsed = z.array(FieldLogic).parse(logics);
  const ids = new Set((await fieldsOf(tx, formId)).map((field) => field.id));

  if (parsed.some((logic) => !ids.has(logic.fieldId) || logic.fieldId === fieldId))
    throw new ORPCError('BAD_REQUEST', { message: 'A rule names a field the form lacks' });
};

/** The field of `id` and its form, which the caller reads or, with `change`, changes. */
const fieldFor = async (tx: Tx, member: PluginMember, id: string, change: boolean) => {
  const [field] = await tx.select(fieldColumns).from(formFields).where(eq(formFields.id, id));

  if (!field) throw new ORPCError('NOT_FOUND', { message: 'No such field' });

  return { field, form: await formFor(tx, member, field.formId, change) };
};

/** A form's fields, step by step, in order. */
const list = reads(PERMISSIONS.channelView)
  .input(z.object({ formId: z.string() }))
  .output(z.array(FormField))
  .handler(async ({ input, context: { tx, member } }) => {
    await formFor(tx, member, input.formId, false);

    return fieldsOf(tx, input.formId);
  });

/** A new field at the end of a step, the first step unless `pageNumber` names another. */
const add = writes(PERMISSIONS.channelView)
  .input(
    FieldInput.required({ type: true }).extend({
      formId: z.string(),
      pageNumber: z.number().int().min(1).default(1),
    }),
  )
  .output(FormField)
  .handler(async ({ input: { formId, ...input }, context: { tx, member } }) => {
    const form = await formFor(tx, member, formId, true);

    checkStep(form.steps.length, input.pageNumber);

    if (input.logics) await checkLogics(tx, formId, null, input.logics);

    const [created] = await tx
      .insert(formFields)
      .values({
        ...input,
        orgId: member.orgId,
        formId,
        order: sql`(
          select coalesce(max(${formFields.order}) + 1, 0) from ${formFields}
          where ${formFields.formId} = ${formId} and ${formFields.pageNumber} = ${input.pageNumber}
        )`,
      })
      .returning(fieldColumns);

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return created;
  });

/** Changes the given settings of a field. */
const update = writes(PERMISSIONS.channelView)
  .input(FieldInput.extend({ id: z.string() }))
  .output(FormField)
  .handler(async ({ input: { id, ...fields }, context: { tx, member } }) => {
    const { field } = await fieldFor(tx, member, id, true);

    if (fields.logics) await checkLogics(tx, field.formId, id, fields.logics);

    const [changed] = await tx
      .update(formFields)
      .set(fields)
      .where(eq(formFields.id, id))
      .returning(fieldColumns);

    if (!changed) throw new ORPCError('NOT_FOUND', { message: 'No such field' });

    return changed;
  });

/**
 * Deletes fields of one form, and the rules of its other fields that named them. Their answers
 * stay on the submissions.
 */
const remove = writes(PERMISSIONS.channelView)
  .input(z.object({ ids: Ids }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    const rows = await tx
      .select({ id: formFields.id, formId: formFields.formId })
      .from(formFields)
      .where(inArray(formFields.id, input.ids));

    const formIds = [...new Set(rows.map((row) => row.formId))];
    const [formId] = formIds;

    if (rows.length !== input.ids.length || !formId || formIds.length > 1)
      throw new ORPCError('NOT_FOUND', { message: 'No such field' });

    await formFor(tx, member, formId, true);
    await tx.delete(formFields).where(inArray(formFields.id, input.ids));

    // Rules on a removed field go with it.
    await tx
      .update(formFields)
      .set({
        logics: sql`coalesce((
          select jsonb_agg(rule) from jsonb_array_elements(${formFields.logics}) rule
          where not (rule ->> 'fieldId' = any(${sql.param(input.ids)}::text[]))
        ), '[]'::jsonb)`,
      })
      .where(eq(formFields.formId, formId));

    return { ids: input.ids };
  });

/** Puts the fields of `ids` on step `pageNumber` in that order, moving any from other steps. */
const arrange = writes(PERMISSIONS.channelView)
  .input(
    z.object({ formId: z.string(), pageNumber: z.number().int().min(1), ids: z.array(z.string()) }),
  )
  .output(z.array(FormField))
  .handler(async ({ input, context: { tx, member } }) => {
    const form = await formFor(tx, member, input.formId, true);

    checkStep(form.steps.length, input.pageNumber);

    const known = new Set((await fieldsOf(tx, input.formId)).map((field) => field.id));

    if (input.ids.some((id) => !known.has(id)))
      throw new ORPCError('NOT_FOUND', { message: 'No such field' });

    await Promise.all(
      input.ids.map((id, order) =>
        tx
          .update(formFields)
          .set({ pageNumber: input.pageNumber, order })
          .where(eq(formFields.id, id)),
      ),
    );

    return fieldsOf(tx, input.formId);
  });

/** Deletes an empty step of the form; the steps after it move up one. */
const removeStep = writes(PERMISSIONS.channelView)
  .input(z.object({ formId: z.string(), pageNumber: z.number().int().min(1) }))
  .output(z.object({ steps: z.number() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const form = await formFor(tx, member, input.formId, true);

    checkStep(form.steps.length, input.pageNumber);

    const fields = await fieldsOf(tx, input.formId);

    if (form.steps.length <= 1)
      throw new ORPCError('BAD_REQUEST', { message: 'A form keeps at least one step' });

    if (fields.some((field) => field.pageNumber === input.pageNumber))
      throw new ORPCError('CONFLICT', { message: "Move or delete this step's fields first" });

    const steps = form.steps.filter((_, index) => index + 1 !== input.pageNumber);

    await tx.update(forms).set({ steps }).where(eq(forms.id, input.formId));
    await tx
      .update(formFields)
      .set({ pageNumber: sql`${formFields.pageNumber} - 1` })
      .where(and(eq(formFields.formId, input.formId), gt(formFields.pageNumber, input.pageNumber)));

    return { steps: steps.length };
  });

export const fieldProcedures = { list, add, update, remove, arrange, removeStep };
