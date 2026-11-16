import { eq, getTableColumns } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { BrowserInfo, visitors } from '#/db/messenger.ts';
import { reads, writes } from '#/orpc.ts';
import { conversationById, notifyVisitors } from './shared.ts';

/** The row without `org_id`, which the caller already knows. */
const { orgId, ...visitorColumns } = getTableColumns(visitors);

const Visitor = createSelectSchema(visitors, { browser: () => BrowserInfo }).omit({ orgId: true });

/** The open conversation's visitor tells the messenger a member is typing an answer. */
const typing = writes(PERMISSIONS.inboxView)
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const conversation = await conversationById(tx, member, input.id);

    await notifyVisitors(tx, member.orgId, [conversation], 'typing');

    return { id: input.id };
  });

/**
 * What the messenger knows of the conversation's customer: online now, last seen, visits, and
 * the page and browser of the latest one. Null for a customer who never opened a messenger.
 */
const visitor = reads(PERMISSIONS.inboxView)
  .input(z.object({ id: z.string() }))
  .output(Visitor.nullable())
  .handler(async ({ input, context: { tx, member } }) => {
    const conversation = await conversationById(tx, member, input.id);

    const [row] = await tx
      .select(visitorColumns)
      .from(visitors)
      .where(eq(visitors.customerId, conversation.customerId));

    return row ?? null;
  });

export const presenceProcedures = { typing, visitor };
