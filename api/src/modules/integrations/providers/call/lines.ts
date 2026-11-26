import { and, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '#/db/client.ts';
import { callOperators, callQueues, type OPERATOR_STATUSES, type QueueLive } from '#/db/calls.ts';
import { sealSecret } from '../../secrets.ts';

/**
 * A PBX extension: the number the operator's phone signs in with (the SIP username), such as 3001.
 * The softphone puts it in a SIP address, so anything else, an email for one, breaks it.
 */
export const EXTENSION = /^\d{1,30}$/;

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
        extension: z
          .string()
          .trim()
          .regex(EXTENSION, 'An extension is the PBX extension number, such as 3001'),
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

type OperatorStatus = (typeof OPERATOR_STATUSES)[number];

/**
 * What a UCM queue agent's status means for its extension, by the status lowercased without
 * spaces. A status not listed changes nothing.
 */
const AGENT_STATUS: Record<string, OperatorStatus | undefined> = {
  paused: 'paused',
  idle: 'available',
  notinuse: 'available',
  inuse: 'available',
  busy: 'available',
  ringing: 'available',
  ringinuse: 'available',
  onhold: 'available',
  unavailable: 'unavailable',
  invalid: 'unavailable',
};

const statusOf = (agent: z.infer<typeof QueueLive>['agents'][number]) =>
  agent.pausedAt ? 'paused' : AGENT_STATUS[agent.status.toLowerCase().replaceAll(/\s/g, '')];

/**
 * Sets each operator of the account to what the PBX's live board says of its extension, so a
 * pause made on a desk phone or in the PBX shows in frontline too.
 */
export const followAgents = async (
  tx: Tx,
  accountId: string,
  agents: z.infer<typeof QueueLive>['agents'],
) => {
  const byStatus = [...Map.groupBy(agents, statusOf)].filter(
    (entry): entry is [OperatorStatus, typeof agents] => entry[0] !== undefined,
  );

  await Promise.all(
    byStatus.map(([status, those]) =>
      tx
        .update(callOperators)
        .set({ status })
        .where(
          and(
            eq(callOperators.accountId, accountId),
            inArray(
              callOperators.extension,
              those.map((agent) => agent.extension),
            ),
            ne(callOperators.status, status),
          ),
        ),
    ),
  );
};
