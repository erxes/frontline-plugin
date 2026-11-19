import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS, TICKET_TIMELINE } from '#/core.ts';
import { forms, formSubmissions } from '#/db/forms.ts';
import { channelMembers } from '#/db/schema.ts';
import { reads } from '#/orpc.ts';
import { membership, seenBy } from '../channels/access.ts';
import { seenTicket } from './shared.ts';

/** One answer sent about the ticket: when, by whom, and its form's name. */
const Response = z.object({
  id: z.string(),
  formId: z.string(),
  formName: z.string(),
  customerId: z.string().nullable(),
  createdAt: z.date(),
});

/**
 * The form submissions a signed link asked about the ticket (`frontline.form.create_link`, a
 * rating after it is resolved), newest first, of the forms in channels the caller reads. NOT_FOUND
 * when they don't see the ticket.
 */
const responses = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(z.array(Response))
  .handler(async ({ input, context: { tx, member } }) => {
    await seenTicket(tx, member, input.id);

    return tx
      .select({
        id: formSubmissions.id,
        formId: formSubmissions.formId,
        formName: forms.name,
        customerId: formSubmissions.customerId,
        createdAt: formSubmissions.createdAt,
      })
      .from(formSubmissions)
      .innerJoin(forms, eq(forms.id, formSubmissions.formId))
      .leftJoin(channelMembers, membership(member, forms.channelId))
      .where(
        and(
          eq(formSubmissions.referenceType, TICKET_TIMELINE),
          eq(formSubmissions.referenceId, input.id),
          seenBy(member, forms.channelId),
        ),
      )
      .orderBy(desc(formSubmissions.createdAt), desc(formSubmissions.id));
  });

export const responseProcedures = { responses };
