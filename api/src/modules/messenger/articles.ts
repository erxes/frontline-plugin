import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { withOrg } from '#/db/client.ts';
import { articleOf, SearchQuery, searchOf, topicOf } from '../helpcenter/public.ts';
import { react, reactionsOf } from '../knowledgebase/reactions.ts';
import type { Visitor } from './session.ts';
import { asVisitor, messengerIntegration, Params } from './threads.ts';

/** The knowledge base topic the visitor's messenger offers, or NOT_FOUND when it offers none. */
const topicIdOf = async (visitor: Visitor) => {
  const settings = await messengerIntegration(visitor.orgId, visitor.integrationId);

  if (!settings?.knowledgeBaseTopicId)
    throw new ORPCError('NOT_FOUND', { message: 'No knowledge base' });

  return settings.knowledgeBaseTopicId;
};

/** The topic's categories and published public articles. */
const knowledgeBase = asVisitor(async (visitor, _req, res) => {
  res.json(await topicOf(visitor.orgId, await topicIdOf(visitor)));
});

/** One of the topic's articles, counted as viewed, with its reactions and the visitor's pick. */
const article = asVisitor(async (visitor, req, res) => {
  const found = await articleOf(
    visitor.orgId,
    await topicIdOf(visitor),
    Params.parse(req.params).id,
  );

  if (!found) throw new ORPCError('NOT_FOUND', { message: 'No such article' });

  const reactions = await withOrg(visitor.orgId, (tx) =>
    reactionsOf(tx, found.id, visitor.customerId),
  );

  res.json({ ...found, reactions });
});

/** The visitor's one reaction to an article, or none with `null`; answers with its reactions. */
const reactTo = asVisitor(async (visitor, req, res) => {
  const { choice } = z.object({ choice: z.string().max(2000).nullable() }).parse(req.body);
  const topicId = await topicIdOf(visitor);
  const articleId = Params.parse(req.params).id;

  res.json(
    await withOrg(visitor.orgId, (tx) => react(tx, visitor, { topicId, articleId, choice })),
  );
});

/** The topic's articles that hold the visitor's search, in their title, summary or text. */
const search = asVisitor(async (visitor, req, res) => {
  const { q } = SearchQuery.parse(req.query);

  res.json(await searchOf(visitor.orgId, await topicIdOf(visitor), q));
});

/** The messenger's knowledge base routes, under `/api/public/messenger/knowledge-base`. */
export const articleRoutes = { knowledgeBase, article, reactTo, search };
