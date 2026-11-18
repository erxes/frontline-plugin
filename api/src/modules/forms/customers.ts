import { core } from '#/core.ts';
import type { formFields } from '#/db/forms.ts';
import { Attachment } from '#/db/table.ts';
import { logger } from '#/logger.ts';

type Field = typeof formFields.$inferSelect;

/** How the sex field's options read, as ISO/IEC 5218 codes. */
const SEX_CODES: Record<string, 0 | 1 | 2 | 9> = { Male: 1, Female: 2, 'Not applicable': 9 };

/** The customer fields a submission answered, by the name after `core:customer:`. */
const customerAnswers = (fields: Field[], values: Record<string, unknown>) => {
  const text = (name: string) => {
    const field = fields.find((each) => each.type === `core:customer:${name}`);
    const value = field ? values[field.id] : undefined;

    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  };

  const avatar = fields.find((each) => each.type === 'core:customer:avatar');
  const files = Attachment.array().safeParse(avatar ? values[avatar.id] : undefined);
  const sex = text('sex');

  return {
    primaryEmail: text('email')?.toLowerCase(),
    primaryPhone: text('phone'),
    firstName: text('firstName'),
    lastName: text('lastName'),
    extra: {
      middleName: text('middleName'),
      description: text('description'),
      birthDate: text('birthDate')?.slice(0, 10),
      sex: sex ? SEX_CODES[sex] : undefined,
      avatarUrl: files.data?.at(0)?.url,
    },
  };
};

/**
 * The core customer a submission is from: the one with its email or phone, else a new one from
 * its name, a lead unless the form saves customers. A submission without any of them has none.
 * A new customer takes every answer; one found takes only the fields it has blank.
 * Called outside the submission's transaction, so a failed core call only loses the link.
 */
export const customerOfSubmission = async (
  organizationId: string,
  form: { id: string; saveAsCustomer: boolean },
  fields: Field[],
  values: Record<string, unknown>,
) => {
  const { extra, ...identity } = customerAnswers(fields, values);
  const customers = core.forOrg(organizationId).customers;
  const state = form.saveAsCustomer ? 'customer' : 'lead';
  const source = { source: 'form', sourceDetails: { form: form.id } };

  if (!identity.primaryEmail && !identity.primaryPhone && !identity.firstName && !identity.lastName)
    return { customerId: null, created: false };

  try {
    const { customer, created } =
      identity.primaryEmail || identity.primaryPhone
        ? await customers.findOrCreate({ ...identity, state, ...source })
        : {
            customer: await customers.create({
              firstName: identity.firstName,
              lastName: identity.lastName,
              state,
              ...source,
            }),
            created: true,
          };

    // Anyone can type a known customer's email, so on one found the answers only fill what the
    // customer left blank, never replace what they or the team wrote.
    const fill = created
      ? extra
      : {
          middleName: customer.middleName ? undefined : extra.middleName,
          description: customer.description ? undefined : extra.description,
          birthDate: customer.birthDate ? undefined : extra.birthDate,
          sex: customer.sex ? undefined : extra.sex,
          avatarUrl: customer.avatarUrl ? undefined : extra.avatarUrl,
        };

    if (Object.values(fill).some((value) => value !== undefined))
      await customers.update({ id: customer.id, ...fill });

    return { customerId: customer.id, created };
  } catch (error) {
    logger.warn({ err: error, formId: form.id, organizationId }, 'Form customer not saved');

    return { customerId: null, created: false };
  }
};
