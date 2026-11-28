import { isDeepStrictEqual } from 'node:util';
import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { CONVERSATION_TIMELINE, core, PERMISSIONS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { conversations } from '#/db/inbox.ts';
import { FieldValues, FieldValuesPatch } from '#/db/table.ts';
import { reads, writesWithCore } from '#/orpc.ts';
import { conversationById, signalMembers } from './shared.ts';

/** The conversation's values, once the member may read it. */
const valuesOf = async (tx: Tx, member: PluginMember, id: string, lock = false) => {
  await conversationById(tx, member, id);

  const query = tx
    .select({ values: conversations.propertiesData })
    .from(conversations)
    .where(eq(conversations.id, id));

  const [row] = await (lock ? query.for('update') : query);

  return row?.values ?? {};
};

/** The conversation's Data Extensions values by field id, for core's Fields tab. */
const values = reads(PERMISSIONS.inboxView)
  .route({ summary: "Get a conversation's field values, keyed by field id" })
  .input(z.object({ id: z.string() }))
  .output(FieldValues)
  .handler(({ input, context: { tx, member } }) => valuesOf(tx, member, input.id));

/**
 * Saves a patch of values, null to clear one. Core keeps the fields of `frontline.conversation`
 * and checks the patch against them and the member's role, outside the transaction; the conversation keeps what it
 * answers. Values another member saved meanwhile make it a conflict to try again.
 */
const save = writesWithCore(
  PERMISSIONS.conversationEditFields,
  z.object({ id: z.string(), patch: FieldValuesPatch }),
  async (member, input) => {
    const current = await withOrg(member.orgId, (tx) => valuesOf(tx, member, input.id));

    const { values: checked } = await core.forOrg(member.orgId).dataValues.check({
      recordType: CONVERSATION_TIMELINE,
      current,
      patch: input.patch,
      userId: member.userId,
      appliesTo: {},
    });

    return { current, checked };
  },
)
  .route({
    summary:
      "Save changes to a conversation's field values, null to clear one; conflicts if someone saved meanwhile",
  })
  .output(FieldValues)
  .handler(async ({ input, context: { tx, member, fromCore } }) => {
    const { current, checked } = fromCore;

    if (!isDeepStrictEqual(await valuesOf(tx, member, input.id, true), current))
      throw new ORPCError('CONFLICT', { message: 'The fields changed meanwhile: save again' });

    await tx
      .update(conversations)
      .set({ propertiesData: checked })
      .where(eq(conversations.id, input.id));
    await signalMembers(tx, member.orgId, [input.id]);

    return checked;
  });

export const conversationPropertyProcedures = { properties: { values, save } };
