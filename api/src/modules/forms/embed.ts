import { ORPCError } from '@orpc/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { config } from '#/config.ts';
import { FORM_EVENTS, PERMISSIONS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { formAnswers, formFields, formSubmissions, forms } from '#/db/forms.ts';
import { writes } from '#/orpc.ts';
import { keyOfOrganization, organizationOfKey } from '../public.ts';
import { Answers, checkAnswers } from './answers.ts';
import { customerOfSubmission } from './customers.ts';
import { formFor, publishFormEvents } from './shared.ts';

/** Where an embed reads a form and sends its answers. */
const urlOf = (key: string, code: string) =>
  `${config.publicUrl}/api/public/${encodeURIComponent(key)}/forms/${encodeURIComponent(code)}`;

/** The form's public address, under the organisation's key, made the first time it is asked for. */
const embed = writes(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(z.object({ code: z.string(), url: z.string() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const form = await formFor(tx, member, input.id, false);
    const key = await keyOfOrganization(tx, member.orgId);

    return { code: form.code, url: urlOf(key, form.code) };
  });

export const embedProcedures = { embed };

/** An active form by its code, and its fields in order, as a visitor's transaction reads them. */
const activeForm = async (tx: Tx, code: string) => {
  const [form] = await tx
    .select()
    .from(forms)
    .where(and(eq(forms.code, code), eq(forms.status, 'active')));

  if (!form) return null;

  const fields = await tx
    .select()
    .from(formFields)
    .where(eq(formFields.formId, form.id))
    .orderBy(asc(formFields.pageNumber), asc(formFields.order));

  return { form, fields };
};

/** What a visitor sees of a form: none of the member-only columns. */
const visitorView = ({ form, fields }: NonNullable<Awaited<ReturnType<typeof activeForm>>>) => {
  const { orgId, channelId, createdBy, viewCount, contactsGathered, ...shown } = form;

  return {
    form: shown,
    fields: fields.map(({ orgId: _org, formId, createdAt, updatedAt, ...field }) => field),
  };
};

const Params = z.object({ key: z.string().max(100), code: z.string().max(100) });

const Submit = z.object({ answers: Answers });

/** The organisation the request's key names, and the form code, or nothing for a bad key. */
const keyed = async (req: Request) => {
  const params = Params.safeParse(req.params);
  const organizationId = params.success ? await organizationOfKey(params.data.key) : undefined;

  return params.success && organizationId ? { organizationId, code: params.data.code } : null;
};

/** A form for an embed: its settings and fields. Each read counts as a view. */
const show = async (req: Request, res: Response) => {
  const route = await keyed(req);

  const found =
    route &&
    (await withOrg(route.organizationId, async (tx) => {
      const active = await activeForm(tx, route.code);

      if (active)
        await tx
          .update(forms)
          .set({ viewCount: sql`${forms.viewCount} + 1`, updatedAt: sql`${forms.updatedAt}` })
          .where(eq(forms.id, active.form.id));

      return active;
    }));

  if (!found) {
    res.status(404).json({ message: 'No such form' });

    return;
  }

  res.json(visitorView(found));
};

/**
 * A visitor's answers: checked against the form's fields, then saved with the customer they
 * name, which core finds or makes outside the transaction. 422 lists what to fix.
 */
const submit = async (req: Request, res: Response) => {
  const route = await keyed(req);
  const body = Submit.safeParse(req.body);

  if (!body.success) {
    res.status(400).json({ message: 'Send answers by field id' });

    return;
  }

  const found = route && (await withOrg(route.organizationId, (tx) => activeForm(tx, route.code)));

  if (!route || !found) {
    res.status(404).json({ message: 'No such form' });

    return;
  }

  const { values, errors } = checkAnswers(found.fields, body.data.answers);

  if (errors.length > 0) {
    res.status(422).json({ message: 'Some answers need fixing', errors });

    return;
  }

  const { organizationId } = route;
  const customer = await customerOfSubmission(organizationId, found.form, found.fields, values);

  const submissionId = await withOrg(organizationId, (tx) =>
    saveSubmission(tx, organizationId, found.form, values, customer),
  );

  res.status(201).json({ submissionId, customerId: customer.customerId });
};

/** Saves the submission and its answers, counts a new contact, and puts it on the timelines. */
const saveSubmission = async (
  tx: Tx,
  organizationId: string,
  form: { id: string; name: string },
  values: Record<string, unknown>,
  customer: { customerId: string | null; created: boolean },
) => {
  const [saved] = await tx
    .insert(formSubmissions)
    .values({ orgId: organizationId, formId: form.id, customerId: customer.customerId })
    .returning({ id: formSubmissions.id });

  if (!saved) throw new ORPCError('INTERNAL_SERVER_ERROR');

  const answers = Object.entries(values).map(([fieldId, value]) => ({
    orgId: organizationId,
    submissionId: saved.id,
    fieldId,
    value,
  }));

  if (answers.length > 0) await tx.insert(formAnswers).values(answers);

  if (customer.created)
    await tx
      .update(forms)
      .set({
        contactsGathered: sql`${forms.contactsGathered} + 1`,
        updatedAt: sql`${forms.updatedAt}`,
      })
      .where(eq(forms.id, form.id));

  await publishFormEvents(tx, organizationId, null, [
    {
      entityId: form.id,
      type: FORM_EVENTS.submitted.type,
      summary: `Submitted ${form.name}`,
      payload: { formId: form.id, submissionId: saved.id, answers: values },
      customerId: customer.customerId,
    },
  ]);

  return saved.id;
};

/** The signed-out routes embeds call, at `/api/public/:key/forms/:code`. */
export const formsPublicRouter = Router({ mergeParams: true })
  .get('/forms/:code', show)
  .post('/forms/:code', submit);
