import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { AVAILABILITIES, memberAvailability } from '#/db/inbox.ts';
import { reads, writes } from '#/orpc.ts';
import { autoAssign } from './replies.ts';

const Availability = z.object({ status: z.enum(AVAILABILITIES) });

/** Whether the caller takes conversations now; available until they say otherwise. */
const mine = reads(PERMISSIONS.inboxView)
  .route({ summary: 'Get whether you take conversations now: available or away' })
  .input(z.object({}))
  .output(Availability)
  .handler(async ({ context: { tx, member } }) => {
    const [row] = await tx
      .select({ status: memberAvailability.status })
      .from(memberAvailability)
      .where(eq(memberAvailability.userId, member.userId));

    return { status: row?.status ?? 'available' };
  });

/**
 * Sets whether the caller takes conversations: an away member gets none from auto-assignment or
 * reassignment, and the channel's away message answers when everyone is. Coming back picks up the
 * conversations waiting for someone at once.
 */
const set = writes(PERMISSIONS.inboxView)
  .route({
    summary:
      'Set yourself available or away; away members get no conversations from auto-assignment',
  })
  .input(Availability)
  .output(Availability)
  .handler(async ({ input, context: { tx, member } }) => {
    await tx
      .insert(memberAvailability)
      .values({ orgId: member.orgId, userId: member.userId, status: input.status })
      .onConflictDoUpdate({
        target: [memberAvailability.orgId, memberAvailability.userId],
        set: { status: input.status, changedAt: sql`now()` },
      });

    if (input.status === 'available') await autoAssign(tx, member.orgId);

    return input;
  });

/** The members who are away, for pickers that show who takes conversations. */
const away = reads(PERMISSIONS.inboxView)
  .route({ summary: 'List the members who are away' })
  .input(z.object({}))
  .output(z.object({ userIds: z.array(z.string()) }))
  .handler(async ({ context: { tx } }) => {
    const rows = await tx
      .select({ userId: memberAvailability.userId })
      .from(memberAvailability)
      .where(eq(memberAvailability.status, 'away'));

    return { userIds: rows.map((row) => row.userId) };
  });

export const availabilityProcedures = { mine, set, away };
