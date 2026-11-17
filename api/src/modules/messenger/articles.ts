import { ORPCError } from '@orpc/server';
import { articleOf, topicOf } from '../helpcenter/public.ts';
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

/** One of the topic's articles, counted as viewed. */
const article = asVisitor(async (visitor, req, res) => {
  const found = await articleOf(
    visitor.orgId,
    await topicIdOf(visitor),
    Params.parse(req.params).id,
  );

  if (!found) throw new ORPCError('NOT_FOUND', { message: 'No such article' });

  res.json(found);
});

/** The messenger's knowledge base routes, under `/api/public/messenger/knowledge-base`. */
export const articleRoutes = { knowledgeBase, article };
