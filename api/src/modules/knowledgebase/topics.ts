import { ORPCError } from '@orpc/server';
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { kbArticles, kbCategories, kbTopics } from '#/db/schema.ts';
import { reads, writes } from '#/orpc.ts';
import { Blank, Color, Title } from '../fields.ts';
import { compileFilter, type FilterFields } from '@erxes/plugin-sdk/filter';
import { FilterInput, likeText } from '../filter.ts';
import { Code, codeTaken, kbErrors, topicColumns } from './shared.ts';

const Fields = z
  .object({
    title: Title,
    description: Blank(1000),
    code: Code,
    color: Color.nullable(),
    backgroundImage: Blank(2000),
    languageCode: z
      .string()
      .regex(/^[a-z]{2}$/)
      .nullable(),
  })
  .partial();

/** How many recently changed articles a topic shows on its card. */
const LATEST = 3;

const LatestArticle = z.object({ id: z.string(), title: z.string() });

/**
 * The row, with how many categories and articles it holds and its last changed articles, newest
 * first, which the query selects.
 */
const Topic = createSelectSchema(kbTopics)
  .omit({ orgId: true })
  .extend({
    categoryCount: z.number(),
    articleCount: z.number(),
    latestArticles: z.array(LatestArticle),
  });

/** Topics with their counts. A one-table select leaves columns bare, so the outer id is named. */
const topicRows = (tx: Tx) =>
  tx
    .select({
      ...topicColumns,
      categoryCount: sql<number>`(
        select count(*)::int from ${kbCategories} filed where filed.topic_id = ${kbTopics}.id
      )`,
      articleCount: sql<number>`(
        select count(*)::int from ${kbArticles} written
        join ${kbCategories} filed on filed.id = written.category_id
        where filed.topic_id = ${kbTopics}.id
      )`,
      latestArticles: sql<z.output<typeof LatestArticle>[]>`coalesce((
        select jsonb_agg(jsonb_build_object('id', recent.id, 'title', recent.title)
          order by recent.updated_at desc, recent.id)
        from (
          select written.id, written.title, written.updated_at from ${kbArticles} written
          join ${kbCategories} filed on filed.id = written.category_id
          where filed.topic_id = ${kbTopics}.id
          order by written.updated_at desc, written.id
          limit ${LATEST}
        ) recent
      ), '[]'::jsonb)`,
    })
    .from(kbTopics)
    .$dynamic();

const topicById = async (tx: Tx, id: string) => {
  const [topic] = await topicRows(tx).where(eq(kbTopics.id, id));

  if (!topic) throw new ORPCError('NOT_FOUND', { message: 'No such topic' });

  return topic;
};

/** What the topics list's filter bar narrows them by (`ui/src/modules/knowledgebase/TopicsPage.tsx`). */
const TOPIC_FILTER: FilterFields = {
  'subject.title': { type: 'text', expr: kbTopics.title },
  'subject.description': { type: 'text', expr: kbTopics.description },
  'subject.code': { type: 'text', expr: kbTopics.code },
  'subject.languageCode': { type: 'select', expr: kbTopics.languageCode },
  'subject.createdBy': { type: 'member', expr: kbTopics.createdBy },
  'subject.createdAt': { type: 'date', expr: kbTopics.createdAt },
};

/**
 * Every topic by title, narrowed by the filter bar (`search` matches the title or description),
 * and what the caller may change in the knowledge base, so a screen hides the actions they
 * would be refused.
 */
const list = reads(PERMISSIONS.kbView)
  .input(z.object(FilterInput))
  .output(
    z.object({
      topics: z.array(Topic),
      can: z.object({ topics: z.boolean(), categories: z.boolean(), articles: z.boolean() }),
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => ({
    topics: await topicRows(tx)
      .where(
        and(
          input.search
            ? or(
                ilike(kbTopics.title, likeText(input.search)),
                ilike(kbTopics.description, likeText(input.search)),
              )
            : undefined,
          compileFilter(TOPIC_FILTER, input.filter, { me: member.userId }),
        ),
      )
      .orderBy(asc(sql`lower(${kbTopics.title})`), asc(kbTopics.id)),
    can: {
      topics: member.can(PERMISSIONS.kbTopicManage),
      categories: member.can(PERMISSIONS.kbCategoryManage),
      articles: member.can(PERMISSIONS.kbArticleManage),
    },
  }));

/** One topic. */
const get = reads(PERMISSIONS.kbView)
  .input(z.object({ id: z.string() }))
  .output(Topic)
  .handler(({ input, context: { tx } }) => topicById(tx, input.id));

const create = writes(PERMISSIONS.kbTopicManage)
  .errors(kbErrors)
  .input(Fields.required({ title: true }))
  .output(Topic)
  .handler(async ({ input, context: { tx, member }, errors }) => {
    const [created] = await tx
      .insert(kbTopics)
      .values({ ...input, orgId: member.orgId, createdBy: member.userId })
      .returning({ id: kbTopics.id })
      .catch(codeTaken(errors, input.code));

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return topicById(tx, created.id);
  });

/** Changes the fields given. */
const update = writes(PERMISSIONS.kbTopicManage)
  .errors(kbErrors)
  .input(Fields.extend({ id: z.string() }))
  .output(Topic)
  .handler(async ({ input: { id, ...fields }, context: { tx }, errors }) => {
    await tx
      .update(kbTopics)
      .set(fields)
      .where(eq(kbTopics.id, id))
      .catch(codeTaken(errors, fields.code));

    return topicById(tx, id);
  });

/** Deletes the topics with their categories and their articles. */
const remove = writes(PERMISSIONS.kbTopicManage)
  .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx } }) => {
    const removed = await tx
      .delete(kbTopics)
      .where(inArray(kbTopics.id, input.ids))
      .returning({ id: kbTopics.id });

    return { ids: removed.map((row) => row.id) };
  });

export const topicProcedures = { list, get, create, update, remove };
