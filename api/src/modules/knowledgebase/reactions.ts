import { ORPCError } from '@orpc/server';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PLUGIN } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { kbArticleReactions, kbArticles, kbCategories } from '#/db/schema.ts';
import { reads } from '#/orpc.ts';
import { published } from '../shownFiles.ts';

/** The live topic a reaction to the article signals, which its panel listens on. */
const reactionTopic = (articleId: string) => `kb-article.${articleId.toLowerCase()}`;

/** One of an article's reaction choices: how many readers picked it, and whether this one did. */
const Reaction = z.object({ choice: z.string(), count: z.number(), mine: z.boolean() });

/**
 * Each reaction the article offers, in its order, with its count and whether `customerId` picked
 * it. A reaction to a choice the article no longer offers isn't counted.
 */
export const reactionsOf = async (tx: Tx, articleId: string, customerId: string | null) => {
  const { rows } = await tx.execute(sql`
    select offered.choice, count(said.id)::int as count,
      coalesce(bool_or(said.customer_id = ${customerId}), false) as mine
    from ${kbArticles} article
    cross join unnest(article.reaction_choices) with ordinality as offered(choice, place)
    left join ${kbArticleReactions} said
      on said.article_id = article.id and said.choice = offered.choice
    where article.id = ${articleId}
    group by offered.choice, offered.place
    order by offered.place`);

  return z.array(Reaction).parse(rows);
};

/** An article's reactions as a visitor reads them. */
export type ArticleReactions = Awaited<ReturnType<typeof reactionsOf>>;

/**
 * Sets the visitor's one reaction to a published public article of `topicId`, or takes it off
 * with `null`; BAD_REQUEST for a choice the article doesn't offer.
 */
export const react = async (
  tx: Tx,
  { orgId, customerId }: { orgId: string; customerId: string },
  { topicId, articleId, choice }: { topicId: string; articleId: string; choice: string | null },
) => {
  const [article] = await tx
    .select({ reactionChoices: kbArticles.reactionChoices })
    .from(kbArticles)
    .innerJoin(kbCategories, eq(kbCategories.id, kbArticles.categoryId))
    .where(and(eq(kbArticles.id, articleId), published, eq(kbCategories.topicId, topicId)));

  if (!article) throw new ORPCError('NOT_FOUND', { message: 'No such article' });

  const mine = and(
    eq(kbArticleReactions.articleId, articleId),
    eq(kbArticleReactions.customerId, customerId),
  );

  if (choice === null) {
    await tx.delete(kbArticleReactions).where(mine);
  } else if (article.reactionChoices.includes(choice)) {
    await tx
      .insert(kbArticleReactions)
      .values({ orgId, articleId, customerId, choice })
      .onConflictDoUpdate({
        target: [
          kbArticleReactions.orgId,
          kbArticleReactions.articleId,
          kbArticleReactions.customerId,
        ],
        set: { choice, createdAt: sql`now()` },
      });
  } else {
    throw new ORPCError('BAD_REQUEST', { message: 'Pick one of the reactions offered' });
  }

  // Members with the article open recount.
  await tx.execute(sql`select core_live_signal(${orgId}, ${PLUGIN}, ${reactionTopic(articleId)})`);

  return reactionsOf(tx, articleId, customerId);
};

/** How readers reacted to the article, a count for each choice it offers; none for an unknown id. */
const reactions = reads(PERMISSIONS.kbView)
  .route({ summary: "Count readers' reactions to an article, one count per choice it offers" })
  .input(z.object({ id: z.string() }))
  .output(z.array(Reaction.omit({ mine: true })))
  .handler(({ input: { id }, context: { tx } }) => reactionsOf(tx, id, null));

export const reactionProcedures = { reactions };
