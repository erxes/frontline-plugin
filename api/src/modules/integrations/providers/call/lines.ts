import { and, eq, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '#/db/client.ts';
import { callOperators, callQueues } from '#/db/calls.ts';
import { sealSecret } from '../../secrets.ts';

/**
 * A PBX's queues frontline follows and the members who answer it by extension, as connect and
 * the account's settings both take them.
 */
export const Lines = {
  queues: z
    .array(z.object({ queue: z.string().trim().min(1).max(30), name: z.string().trim().max(100) }))
    .max(100),
  operators: z
    .array(
      z.object({
        userId: z.string().min(1),
        extension: z.string().trim().min(1).max(30),
        /** The extension's SIP password, for the member's softphone. */
        sipPassword: z.string().min(1).max(200).optional(),
      }),
    )
    .max(500),
};

type Lines = { [K in keyof typeof Lines]: z.infer<(typeof Lines)[K]> };

/**
 * Makes the account's queues and operators these. Queues and operators not listed go; a kept
 * queue keeps its counters, and a kept operator its status and SIP password unless a new one is
 * given.
 */
export const saveLines = async (
  tx: Tx,
  orgId: string,
  accountId: string,
  { queues, operators }: Lines,
) => {
  await tx.delete(callQueues).where(
    and(
      eq(callQueues.accountId, accountId),
      notInArray(
        callQueues.queue,
        queues.map((queue) => queue.queue),
      ),
    ),
  );

  if (queues.length)
    await tx
      .insert(callQueues)
      .values(queues.map((queue) => ({ ...queue, orgId: orgId, accountId })))
      .onConflictDoUpdate({
        target: [callQueues.orgId, callQueues.accountId, callQueues.queue],
        set: { name: sql`excluded.name` },
      });

  // An operator whose extension changed goes first, so the unique keys hold; one that stayed
  // keeps its status.
  await tx.delete(callOperators).where(
    and(
      eq(callOperators.accountId, accountId),
      sql`${callOperators.userId} || ' ' || ${callOperators.extension} <> all(array[${sql.join(
        operators.map((operator) => sql`${`${operator.userId} ${operator.extension}`}`),
        sql`, `,
      )}]::text[])`,
    ),
  );

  if (operators.length)
    await tx
      .insert(callOperators)
      .values(
        operators.map(({ sipPassword: _password, ...operator }) => ({
          ...operator,
          orgId: orgId,
          accountId,
        })),
      )
      .onConflictDoNothing();

  for (const { userId, extension, sipPassword } of operators)
    if (sipPassword)
      await tx
        .update(callOperators)
        .set({ sipSecret: sealSecret(orgId, { password: sipPassword }) })
        .where(
          and(
            eq(callOperators.accountId, accountId),
            eq(callOperators.userId, userId),
            eq(callOperators.extension, extension),
          ),
        );
};
