import { ORPCError } from '@orpc/server';
import { asc, eq, getTableColumns, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { FORM_EVENTS, PERMISSIONS } from '#/core.ts';
import { FORM_STATUSES, formFields, forms } from '#/db/forms.ts';
import { writes } from '#/orpc.ts';
import { Ids } from '../fields.ts';
import { Form, formById, formFor, formsFor, newCode, publishFormEvents } from './shared.ts';

/** Deletes the forms with their fields and submissions: all of them, or none when one is refused. */
const remove = writes(PERMISSIONS.channelView)
  .input(z.object({ ids: Ids }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    await formsFor(tx, member, input.ids, true);

    const removed = await tx
      .delete(forms)
      .where(inArray(forms.id, input.ids))
      .returning({ id: forms.id });

    return { ids: removed.map((row) => row.id) };
  });

/** Archives the forms, which stops their embeds, or makes them active again, in one statement. */
const setStatus = writes(PERMISSIONS.channelView)
  .input(z.object({ ids: Ids, status: z.enum(FORM_STATUSES) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    const rows = await formsFor(tx, member, input.ids, true);
    const moving = rows.filter((row) => row.status !== input.status);

    if (moving.length === 0) return { ids: [] };

    await tx
      .update(forms)
      .set({ status: input.status })
      .where(
        inArray(
          forms.id,
          moving.map((row) => row.id),
        ),
      );

    await publishFormEvents(
      tx,
      member.orgId,
      member,
      moving.map((row) => ({
        entityId: row.id,
        type: FORM_EVENTS.fieldsChanged.type,
        summary: input.status === 'archived' ? 'Archived the form' : 'Made the form active',
        payload: { fields: ['status'], before: { status: row.status }, after: input },
      })),
    );

    return { ids: moving.map((row) => row.id) };
  });

const { id, orgId, formId, createdAt, updatedAt, ...fieldCopy } = getTableColumns(formFields);

/** A copy of the form and its fields, in the same channel, active, with a new code and no counts. */
const duplicate = writes(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Form)
  .handler(async ({ input, context: { tx, member } }) => {
    const {
      id: sourceId,
      code: _code,
      viewCount: _views,
      contactsGathered: _contacts,
      createdAt: _created,
      updatedAt: _updated,
      ...form
    } = await formFor(tx, member, input.id, true);

    const [copy] = await tx
      .insert(forms)
      .values({
        ...form,
        name: `${form.name} (copy)`.slice(0, 200),
        status: 'active',
        orgId: member.orgId,
        code: newCode(),
        createdBy: member.userId,
      })
      .returning({ id: forms.id, name: forms.name });

    if (!copy) throw new ORPCError('INTERNAL_SERVER_ERROR');

    const fields = await tx
      .select({ id: formFields.id, ...fieldCopy })
      .from(formFields)
      .where(eq(formFields.formId, sourceId))
      .orderBy(asc(formFields.pageNumber), asc(formFields.order));

    // Copied fields get new ids, so their show and hide rules point at the copies.
    const ids = new Map(fields.map((field) => [field.id, crypto.randomUUID()]));

    if (fields.length > 0)
      await tx.insert(formFields).values(
        fields.map(({ id: fieldId, ...field }) => ({
          ...field,
          id: ids.get(fieldId),
          orgId: member.orgId,
          formId: copy.id,
          logics: field.logics.map((logic) => ({
            ...logic,
            fieldId: ids.get(logic.fieldId) ?? logic.fieldId,
          })),
        })),
      );

    await publishFormEvents(tx, member.orgId, member, [
      {
        entityId: copy.id,
        type: FORM_EVENTS.created.type,
        summary: `Created ${copy.name} as a copy`,
        payload: { name: copy.name, copiedFrom: sourceId },
      },
    ]);

    return formById(tx, member, copy.id);
  });

export const formActionProcedures = { remove, setStatus, duplicate };
