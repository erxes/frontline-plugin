import type { CoreCall, PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '#/config.ts';
import { FORM_LINK_DAYS, PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { forms } from '#/db/forms.ts';
import { keyOfOrganization } from '../public.ts';
import { readToken, signToken } from '../tokens.ts';

/**
 * What a form link vouches for. It comes only from a token this API signed, so the visitor
 * can't choose the customer or the record their answer is about.
 */
const FormLink = z.object({
  orgId: z.string(),
  formId: z.string(),
  linkId: z.string(),
  customerId: z.string().nullable(),
  referenceType: z.string().nullable(),
  referenceId: z.string().nullable(),
});

export type FormLink = z.infer<typeof FormLink>;

/** The link a token names, or null when it is forged, expired or made for another form. */
export const formLinkOf = async (token: string, orgId: string, formId: string) => {
  const link = await readToken('form links', token, FormLink);

  return link?.orgId === orgId && link.formId === formId ? link : null;
};

const DAY = 24 * 60 * 60 * 1000;

/** What core POSTs for the step: the form, how long the link lasts, and the run's event. */
const Call = z.object({
  input: z.object({
    formId: z.string().min(1),
    // Core leaves a blank field out. A missing or bad value is the default; more than the most
    // is the most.
    expiresInDays: z
      .unknown()
      .optional()
      .transform((value) => {
        const days = Number(value);

        return days > 0 ? Math.min(Math.round(days), FORM_LINK_DAYS.max) : FORM_LINK_DAYS.default;
      }),
  }),
  context: z
    .object({
      event: z
        .object({
          subjectType: z.string().nullish(),
          subjectId: z.string().nullish(),
          entityType: z.string().nullish(),
          entityId: z.string().nullish(),
        })
        .nullish(),
    })
    .default({}),
});

/**
 * The "Create form link" step: a link to the form on the widgets app that takes one answer before
 * it expires, saved as the run's customer's and about the record its event names. The step's
 * idempotency key is the link's id, so a retried step makes the same link.
 */
export const createFormLink = async (call: CoreCall, body: unknown, key: string) => {
  const { widgetsDomain } = config;

  if (!widgetsDomain)
    throw new ORPCError('PRECONDITION_FAILED', {
      message: 'Set WIDGETS_DOMAIN to make form links',
    });

  const { input, context } = Call.parse(body);

  const found = await withOrg(call.orgId, async (tx) => {
    const [form] = await tx
      .select({ id: forms.id, code: forms.code })
      .from(forms)
      .where(eq(forms.id, input.formId));

    return form && { form, publicKey: await keyOfOrganization(tx, call.orgId) };
  });

  if (!found) throw new ORPCError('NOT_FOUND', { message: 'No such form' });

  const { form, publicKey } = found;
  const event = context.event;
  const about = event?.entityType && event.entityId ? event : null;
  const expiresAt = new Date(Date.now() + input.expiresInDays * DAY);

  const token = await signToken(
    'form links',
    {
      orgId: call.orgId,
      formId: form.id,
      linkId: key,
      customerId: event?.subjectType === 'customer' ? (event.subjectId ?? null) : null,
      referenceType: about?.entityType ?? null,
      referenceId: about?.entityId ?? null,
    } satisfies FormLink,
    expiresAt,
  );

  const path = `/forms/${encodeURIComponent(publicKey)}/${encodeURIComponent(form.code)}`;

  return {
    url: `${widgetsDomain}${path}?link=${token}`,
    expiresAt: expiresAt.toISOString(),
    linkId: key,
    formId: form.id,
  };
};

/**
 * The organisation's forms by name, as core's automation builder lists them for a step's `Form`
 * field (`GET /api/automations/records/form`), to a member who may read forms.
 */
export const formChoices = async (member: PluginMember) => {
  if (!member.can(PERMISSIONS.channelView))
    throw new ORPCError('FORBIDDEN', {
      message: `You need the ${PERMISSIONS.channelView} permission`,
    });

  return withOrg(member.orgId, (tx) =>
    tx.select({ value: forms.id, label: forms.name }).from(forms).orderBy(asc(forms.name)),
  );
};
