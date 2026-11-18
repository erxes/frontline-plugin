import { ORPCError } from '@orpc/server';
import { and, desc, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import { emailSuppressions } from '#/db/mail.ts';
import { reads, writes } from '#/orpc.ts';

/** An address a report said to stop mailing, as a mailbox read it. */
export type Suppressed = Pick<
  typeof emailSuppressions.$inferInsert,
  'address' | 'reason' | 'detail'
>;

/** An address a report said to stop mailing, and the Message-ID of the mail it reports on. */
export type Reported = Suppressed & { about: string | null };

/**
 * Notes the addresses `accountId`'s reports named, each only when its report is about a mail the
 * team sent through that account to that address. Anyone can mail the mailbox a report, so one
 * about any other mail, or naming another recipient, changes nothing. An address already
 * suppressed stays as it was.
 */
export const suppress = async (tx: Tx, orgId: string, accountId: string, reported: Reported[]) => {
  const about = [...new Set(reported.flatMap((row) => (row.about ? [row.about] : [])))];

  if (about.length === 0) return;

  const sent = await tx
    .select({
      messageId: messages.externalId,
      // A mail thread's id starts with the address it is with, which its mails go to.
      address: sql<string>`split_part(${conversations.externalId}, ' ', 1)`,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
    .where(
      and(
        inArray(messages.externalId, about),
        isNull(messages.customerId),
        sql`${integrations.config}->>'accountId' = ${accountId}`,
      ),
    );

  const real = new Set(sent.map((row) => `${row.messageId} ${row.address}`));

  const found = reported.flatMap(({ about: messageId, ...row }) =>
    messageId && real.has(`${messageId} ${row.address}`) ? [row] : [],
  );

  if (found.length === 0) return;

  await tx
    .insert(emailSuppressions)
    .values(found.map((row) => ({ ...row, orgId, accountId })))
    .onConflictDoNothing();
};

/** Which of `addresses` frontline no longer mails, lowercased. */
export const suppressedAmong = async (tx: Tx, addresses: string[]) => {
  const rows = await tx
    .select({ address: emailSuppressions.address })
    .from(emailSuppressions)
    .where(
      inArray(
        emailSuppressions.address,
        addresses.map((address) => address.toLowerCase()),
      ),
    );

  return rows.map((row) => row.address);
};

/** The row without `org_id`, which the caller knows. */
const { orgId, ...columns } = getTableColumns(emailSuppressions);

const Suppression = createSelectSchema(emailSuppressions).omit({ orgId: true });

/** The addresses frontline no longer mails, newest first. */
const list = reads(PERMISSIONS.integrationView)
  .input(z.object({}))
  .output(z.object({ suppressions: z.array(Suppression) }))
  .handler(async ({ context: { tx } }) => {
    const suppressions = await tx
      .select(columns)
      .from(emailSuppressions)
      .orderBy(desc(emailSuppressions.createdAt), desc(emailSuppressions.id));

    return { suppressions };
  });

/** Lets mail reach the addresses again, all of them or none. */
const remove = writes(PERMISSIONS.integrationManage)
  .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx } }) => {
    const removed = await tx
      .delete(emailSuppressions)
      .where(inArray(emailSuppressions.id, input.ids))
      .returning({ id: emailSuppressions.id });

    if (removed.length !== new Set(input.ids).size)
      throw new ORPCError('NOT_FOUND', { message: 'No such suppressed address' });

    return { ids: removed.map((row) => row.id) };
  });

export const suppressionProcedures = { list, remove };
