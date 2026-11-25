import { sql } from 'drizzle-orm';
import { conversations } from '#/db/inbox.ts';
import type { ReplyPolicy } from '#/db/schema.ts';

/** What a reply that ends the customer's wait writes on the conversation. */
export const ANSWERED = {
  waitingSince: null,
  replyDueAt: null,
  replyWarnedAt: null,
  replyBreachedAt: null,
} as const;

/**
 * What a reply to `conversationId` keeps of the wait it ends: how long the customer waited and
 * whether it came by the due time, read before the conversation stops waiting. Null on a
 * conversation nobody waited on.
 */
export const waitEnded = (conversationId: string) => ({
  waitedSeconds: sql<
    number | null
  >`(select floor(extract(epoch from now() - waited.waiting_since))::int
    from ${conversations} waited where waited.id = ${conversationId})`,
  replyOnTime: sql<boolean | null>`(select case when waited.reply_due_at is not null
      then now() <= waited.reply_due_at end
    from ${conversations} waited where waited.id = ${conversationId} and waited.waiting_since is not null)`,
});

/** The conversation as a customer's message finds it, and its channel's rules. */
export type Waiting = {
  waitingSince: Date | null;
  firstRespondedAt: Date | null;
  replyPolicy: ReplyPolicy;
};

/**
 * What a customer's message writes on its conversation: a customer who wasn't waiting starts to,
 * due by the channel's first reply target before anyone answered, else its next reply target.
 * One who already waits keeps their place.
 */
export const startWaiting = ({ waitingSince, firstRespondedAt, replyPolicy }: Waiting) => {
  if (waitingSince) return {};

  const minutes = firstRespondedAt ? replyPolicy.nextReplyMinutes : replyPolicy.firstReplyMinutes;

  return {
    waitingSince: sql`now()`,
    replyDueAt: minutes ? sql`now() + make_interval(mins => ${minutes})` : null,
    replyWarnedAt: null,
    replyBreachedAt: null,
  };
};
