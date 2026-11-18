import { CustomFields, CustomFieldsPatch } from '@erxes/core-contract';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CONVERSATION_TIMELINE, core, PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { conversations } from '#/db/inbox.ts';
import { reads, writes } from '#/orpc.ts';
import { conversationById, signalMembers } from './shared.ts';

const valuesOf = async (tx: Tx, id: string) => {
  const [row] = await tx
    .select({ values: conversations.propertiesData })
    .from(conversations)
    .where(eq(conversations.id, id))
    .for('update');

  return row?.values ?? {};
};

/** The conversation's custom field values by core field id, for core's Properties tab. */
const values = reads(PERMISSIONS.inboxView)
  .input(z.object({ id: z.string() }))
  .output(CustomFields)
  .handler(async ({ input, context: { tx, member } }) => {
    await conversationById(tx, member, input.id);

    return valuesOf(tx, input.id);
  });

/**
 * Saves a patch of values, null to clear one. Core keeps the fields of `frontline.conversation`
 * and checks the patch against them; the conversation keeps what it answers.
 */
const save = writes(PERMISSIONS.conversationEditFields)
  .input(z.object({ id: z.string(), patch: CustomFieldsPatch }))
  .output(CustomFields)
  .handler(async ({ input, context: { tx, member } }) => {
    await conversationById(tx, member, input.id);

    const { values: checked } = await core.forOrg(member.orgId).fields.check({
      contentType: CONVERSATION_TIMELINE,
      current: await valuesOf(tx, input.id),
      patch: input.patch,
    });

    await tx
      .update(conversations)
      .set({ propertiesData: checked })
      .where(eq(conversations.id, input.id));
    await signalMembers(tx, member.orgId, [input.id]);

    return checked;
  });

export const conversationPropertyProcedures = { properties: { values, save } };
