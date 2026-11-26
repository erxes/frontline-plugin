import { and, eq, isNotNull, lte, ne, sql } from 'drizzle-orm';
import { withOrg } from '#/db/client.ts';
import { conversations, integrations } from '#/db/inbox.ts';
import { handBack } from './handBack.ts';

/** How many conversations one run gives back at most; the rest go on the next run. */
const BATCH = 100;

/**
 * Gives the agent back each conversation a person has whose customer has waited longer than its
 * integration's `agentTakeBackMinutes`, and has the agent answer what they wrote. A resolved
 * conversation keeps nobody waiting, so none of those.
 */
export const takeBackWaiting = async (orgId: string) => {
  const answer = await withOrg(orgId, async (tx) => {
    const due = await tx
      .select({
        id: conversations.id,
        customerId: conversations.customerId,
        operator: conversations.operator,
      })
      .from(conversations)
      .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
      .where(
        and(
          eq(conversations.operator, 'person'),
          ne(conversations.status, 'resolved'),
          isNotNull(integrations.agentId),
          isNotNull(integrations.agentTakeBackMinutes),
          lte(
            conversations.waitingSince,
            sql`now() - make_interval(mins => ${integrations.agentTakeBackMinutes})`,
          ),
        ),
      )
      .limit(BATCH)
      .for('update', { of: conversations, skipLocked: true });

    return handBack(tx, orgId, due);
  });

  await answer();
};
