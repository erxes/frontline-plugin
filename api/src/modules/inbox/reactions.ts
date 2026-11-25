import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { integrations, messageReactions, messages } from '#/db/inbox.ts';
import { writesWithCore } from '#/orpc.ts';
import { ADAPTERS } from './adapters.ts';
import { conversationById, signalMembers } from './shared.ts';

/** One emoji on a message: how many have it, and whether the caller does. */
export const Reaction = z.object({ emoji: z.string(), count: z.number(), mine: z.boolean() });

/** A message's emojis, selected beside it, in the order they first appeared. */
export const reactionsOf = (member: PluginMember) => sql<z.output<typeof Reaction>[]>`coalesce((
  select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'count', r.count, 'mine', r.mine)
    order by r.first)
  from (
    select emoji, count(*)::int as count,
      coalesce(bool_or(user_id = ${member.userId}), false) as mine,
      min(created_at) as first
    from ${messageReactions}
    where message_id = ${messages}.id
    group by emoji
  ) r
), '[]'::jsonb)`;

const Emoji = z
  .string()
  .max(32)
  .regex(/^\p{Extended_Pictographic}/u, 'An emoji');

const ReactInput = z.object({ id: z.string(), emoji: Emoji, remove: z.boolean().default(false) });

/**
 * Shows the team's emojis on the message at the provider as they will be after the change. It
 * reads in a transaction of its own and calls the provider once that ends, so a slow provider
 * holds no connection.
 */
const reactAtProvider = async (member: PluginMember, input: z.output<typeof ReactInput>) => {
  const { adapter, reach, conversationId } = await withOrg(member.orgId, async (tx) => {
    const [message] = await tx
      .select({
        conversationId: messages.conversationId,
        customerId: messages.customerId,
        externalId: messages.externalId,
        providerData: messages.providerData,
      })
      .from(messages)
      .where(eq(messages.id, input.id));

    if (!message) throw new ORPCError('NOT_FOUND', { message: 'No such message' });

    const conversation = await conversationById(tx, member, message.conversationId);

    const [integration] = await tx
      .select({ id: integrations.id, kind: integrations.kind, config: integrations.config })
      .from(integrations)
      .where(eq(integrations.id, conversation.integrationId));

    const found = ADAPTERS.get(integration?.kind ?? '');

    if (!integration || !found?.react || !message.customerId)
      throw new ORPCError('BAD_REQUEST', { message: "Only a customer's message takes reactions" });

    const team = await tx
      .select({ userId: messageReactions.userId, emoji: messageReactions.emoji })
      .from(messageReactions)
      .where(and(eq(messageReactions.messageId, input.id), isNotNull(messageReactions.userId)))
      .orderBy(asc(messageReactions.createdAt));

    const after = [
      ...team.filter(
        (row) => !input.remove || row.userId !== member.userId || row.emoji !== input.emoji,
      ),
      ...(input.remove ? [] : [{ userId: member.userId, emoji: input.emoji }]),
    ];

    return {
      adapter: found,
      conversationId: conversation.id,
      reach: await found.react(tx, {
        integration: { id: integration.id, config: integration.config },
        conversation,
        message,
        emoji: input.emoji,
        emojis: [...new Set(after.map((row) => row.emoji))],
      }),
    };
  });

  await reach().catch((error: unknown) => {
    if (error instanceof ORPCError) throw error;

    throw new ORPCError('BAD_REQUEST', {
      message: `${adapter.label} refused the reaction: ${error instanceof Error ? error.message : String(error)}`,
    });
  });

  return { conversationId };
};

/**
 * The member adds an emoji to the customer's message, or takes theirs back with `remove`, and
 * the integration's bot or page shows the team's at the provider. The provider is asked first,
 * so its refusal changes nothing.
 */
const react = writesWithCore(PERMISSIONS.inboxView, ReactInput, reactAtProvider)
  .route({
    summary:
      "React to a customer's message with an emoji, or remove yours; shows at the provider too",
  })
  .output(z.object({ reactions: z.array(Reaction) }))
  .handler(async ({ input, context: { tx, member, fromCore } }) => {
    const mine = and(
      eq(messageReactions.messageId, input.id),
      eq(messageReactions.userId, member.userId),
      eq(messageReactions.emoji, input.emoji),
    );

    await (input.remove
      ? tx.delete(messageReactions).where(mine)
      : tx
          .insert(messageReactions)
          .values({
            orgId: member.orgId,
            messageId: input.id,
            userId: member.userId,
            emoji: input.emoji,
          })
          .onConflictDoNothing());

    await signalMembers(tx, member.orgId, [fromCore.conversationId]);

    const [row] = await tx
      .select({ reactions: reactionsOf(member) })
      .from(messages)
      .where(eq(messages.id, input.id));

    return { reactions: row?.reactions ?? [] };
  });

export const reactionProcedures = { react };
