import { ORPCError } from '@orpc/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import express, { type Request, type Response, Router } from 'express';
import { z } from 'zod';
import { config } from '#/config.ts';
import { FORM_EVENTS, PERMISSIONS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { formAnswers, formFields, formSubmissions, forms } from '#/db/forms.ts';
import { writes } from '#/orpc.ts';
import { fail } from '../fail.ts';
import {
  fileIdOf,
  filesOf,
  rawUpload,
  readFile,
  receiptOf,
  sendFile,
  storeFile,
  type Uploaded,
  uploadOf,
} from '../files.ts';
import { keyOfOrganization, organizationOfKey, widgetScript } from '../public.ts';
import { type Answer, checkAnswers, FILE_FIELDS, VisitorAnswers } from './answers.ts';
import { customerOfSubmission } from './customers.ts';
import { formFor, publishFormEvents } from './shared.ts';

type Field = typeof formFields.$inferSelect;

/** Where an embed reads a form and sends its answers. */
const urlOf = (key: string, code: string) =>
  `${config.publicUrl}/api/public/${encodeURIComponent(key)}/forms/${encodeURIComponent(code)}`;

/**
 * The form's public address, under the organisation's key, made the first time it is asked for,
 * and the script a website adds to show it.
 */
const embed = writes(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(z.object({ code: z.string(), url: z.string(), script: z.string() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const form = await formFor(tx, member, input.id, false);
    const key = await keyOfOrganization(tx, member.orgId);

    return {
      code: form.code,
      url: urlOf(key, form.code),
      script: widgetScript('form', { key, code: form.code }),
    };
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

/** The form's images by the name `/images/:which` serves them under. */
const IMAGES = { callout: 'calloutImage', thank: 'thankImage' } as const;

/**
 * What a visitor sees of a form: none of the member-only columns, and its images at `/images`
 * under `url`, since core serves its files to members only.
 */
const visitorView = (
  { form, fields }: NonNullable<Awaited<ReturnType<typeof activeForm>>>,
  url: string,
) => {
  const { orgId, channelId, createdBy, viewCount, contactsGathered, ...shown } = form;
  const { calloutImage, thankImage } = form;

  return {
    form: {
      ...shown,
      calloutImage: calloutImage && { ...calloutImage, url: `${url}/images/callout` },
      thankImage: thankImage && { ...thankImage, url: `${url}/images/thank` },
    },
    fields: fields.map(({ orgId: _org, formId, createdAt, updatedAt, ...field }) => field),
  };
};

/** A form as `GET /api/public/:key/forms/:code` answers it, for the form embed. */
export type VisitorForm = ReturnType<typeof visitorView>;

export type { Uploaded } from '../files.ts';

const Params = z.object({ key: z.string().max(100), code: z.string().max(100) });

const Submit = z.object({ answers: VisitorAnswers });

/** Whom a form's file receipts are for: that form, so an upload attaches to no other. */
const ownerOf = (organizationId: string, formId: string) => `form ${organizationId} ${formId}`;

/**
 * The visitor's answers with each file field's receipts swapped for the files they name, and
 * the file fields whose receipts are forged, expired or another form's.
 */
const withFiles = async (
  owner: string,
  fields: Field[],
  answers: z.infer<typeof VisitorAnswers>,
) => {
  const values: Record<string, z.infer<typeof Answer>> = { ...answers };
  const errors: { fieldId: string; message: string }[] = [];

  await Promise.all(
    fields.map(async ({ id, type }) => {
      const receipts = answers[id];

      if (!FILE_FIELDS.has(type) || !Array.isArray(receipts)) return;

      const files = await filesOf(owner, receipts);

      if (files) values[id] = files;
      else errors.push({ fieldId: id, message: 'Attach the file again' });
    }),
  );

  return { values, errors };
};

/** The organisation the request's key names, and the form code, or nothing for a bad key. */
const keyed = async (req: Request) => {
  const params = Params.safeParse(req.params);
  const organizationId = params.success ? await organizationOfKey(params.data.key) : undefined;

  return params.success && organizationId ? { organizationId, ...params.data } : null;
};

const Image = z.enum(['callout', 'thank']);

/** One of an active form's images, streamed from core. */
const image = async (req: Request, res: Response) => {
  try {
    const route = await keyed(req);
    const which = Image.safeParse(req.params.which);

    const found =
      route && (await withOrg(route.organizationId, (tx) => activeForm(tx, route.code)));

    const id = which.success && found ? fileIdOf(found.form[IMAGES[which.data]]?.url ?? '') : null;
    const file = route && id ? await readFile(route.organizationId, id) : null;

    if (!file) {
      res.status(404).json({ message: 'No such image' });

      return;
    }

    sendFile(res, file, 'public, max-age=300');
  } catch (error) {
    fail(res, error, 'form image');
  }
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

  res.json(visitorView(found, urlOf(route.key, route.code)));
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

  const owner = ownerOf(route.organizationId, found.form.id);
  const withFileAnswers = await withFiles(owner, found.fields, body.data.answers);
  const { values, errors } = checkAnswers(found.fields, withFileAnswers.values);

  errors.push(...withFileAnswers.errors);

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

/**
 * A visitor uploads a file for one of the form's file fields, named in `x-file-name`; core
 * stores it, and the answers attach it by the receipt this answers with.
 */
const upload = async (req: Request, res: Response) => {
  try {
    const route = await keyed(req);

    const found =
      route && (await withOrg(route.organizationId, (tx) => activeForm(tx, route.code)));

    if (!route || !found?.fields.some((field) => FILE_FIELDS.has(field.type))) {
      res.status(404).json({ message: 'No such form' });

      return;
    }

    const file = await storeFile(route.organizationId, uploadOf(req));
    const owner = ownerOf(route.organizationId, found.form.id);
    const reply: Uploaded = { ...file, receipt: await receiptOf(owner, file) };

    res.status(201).json(reply);
  } catch (error) {
    fail(res, error, 'form file');
  }
};

/** The signed-out routes embeds call, at `/api/public/:key/forms/:code`. */
export const formsPublicRouter = Router({ mergeParams: true })
  .get('/forms/:code', show)
  .post('/forms/:code', express.json({ limit: '1mb' }), submit)
  .post('/forms/:code/files', rawUpload, upload)
  .get('/forms/:code/images/:which', image);
