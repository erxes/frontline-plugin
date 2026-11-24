import { ORPCError } from '@orpc/server';
import { and, count, eq, getTableColumns, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { KB_ARTICLE_STATUSES, kbArticles, kbCategories } from '#/db/schema.ts';
import { Attachment, StoredFile } from '#/db/table.ts';
import { reads, writes } from '#/orpc.ts';
import { Blank, Title } from '../fields.ts';
import { compileFilter, type FilterFields } from '@erxes/plugin-sdk/filter';
import { FilterInput, likeText } from '../filter.ts';
import { firstPageCount, orderOf, PageInput, PageOutput } from '../paging.ts';
import { articleSearch, categoryFor, topicFor } from './shared.ts';

const { orgId, content, reactionChoices, image, attachments, pdfAttachment, ...rowColumns } =
  getTableColumns(kbArticles);

const detailColumns = {
  ...rowColumns,
  content,
  reactionChoices,
  image,
  attachments,
  pdfAttachment,
};

const Status = z.enum(KB_ARTICLE_STATUSES);

const Fields = z
  .object({
    categoryId: z.string(),
    title: Title,
    summary: Blank(2000),
    /** HTML from erxes-ui's Editor. */
    content: z.string().max(1_000_000),
    status: Status,
    /** When a scheduled article goes live; required, and ahead, for `scheduled`. */
    scheduledAt: z.date().nullable(),
    isPrivate: z.boolean(),
    reactionChoices: z.array(z.string().max(2000)).max(20),
    image: Attachment.nullable(),
    attachments: z.array(Attachment).max(50),
    pdfAttachment: z.object({ pdf: Attachment }).nullable(),
  })
  .partial();

/** The row with its files typed, and the topic its category is in, which the query joins. */
const Detail = createSelectSchema(kbArticles, {
  image: StoredFile.nullable(),
  attachments: z.array(StoredFile),
  pdfAttachment: z.object({ pdf: StoredFile }).nullable(),
})
  .omit({ orgId: true })
  .extend({ topicId: z.string() });

/** An article as lists show it, without its content and files. */
const Article = createSelectSchema(kbArticles).omit({
  orgId: true,
  content: true,
  reactionChoices: true,
  image: true,
  attachments: true,
  pdfAttachment: true,
});

/**
 * The article's category and every category above it, for a filter that takes in subcategories.
 * A one-table select leaves columns bare, so the outer column is named.
 */
const categoryPath = sql<string[]>`array(
  with recursive up(id, parent_id) as (
    select filed.id, filed.parent_id from ${kbCategories} filed
    where filed.id = ${kbArticles}.category_id
    union
    select above.id, above.parent_id from ${kbCategories} above join up on above.id = up.parent_id
  )
  select id from up
)`;

/**
 * What the articles list's filter bar narrows them by (`ArticlesPage.tsx` in the UI). A
 * category keeps its subcategories' articles too.
 */
const ARTICLE_FILTER: FilterFields = {
  'subject.title': { type: 'text', expr: kbArticles.title },
  'subject.summary': { type: 'text', expr: kbArticles.summary },
  'subject.status': { type: 'select', expr: kbArticles.status },
  'subject.categoryId': { type: 'select', array: true, expr: categoryPath },
  'subject.isPrivate': { type: 'boolean', expr: kbArticles.isPrivate },
  'subject.viewCount': { type: 'number', expr: kbArticles.viewCount },
  'subject.createdBy': { type: 'member', expr: kbArticles.createdBy },
  'subject.createdAt': { type: 'date', expr: kbArticles.createdAt },
  'subject.updatedAt': { type: 'date', expr: kbArticles.updatedAt },
  'subject.publishedAt': { type: 'date', expr: kbArticles.publishedAt },
  'subject.scheduledAt': { type: 'date', expr: kbArticles.scheduledAt },
};

/**
 * Publishes the organisation's scheduled articles whose time has come, as of that time. Core runs
 * it every minute as the `knowledgebase.publish` job.
 */
export const publishScheduled = (organizationId: string) =>
  withOrg(organizationId, async (tx) => {
    const published = await tx
      .update(kbArticles)
      .set({ status: 'publish', publishedAt: sql`${kbArticles.scheduledAt}`, scheduledAt: null })
      .where(and(eq(kbArticles.status, 'scheduled'), lte(kbArticles.scheduledAt, sql`now()`)))
      .returning({ id: kbArticles.id });

    return { published: published.length };
  });

const articleFor = async (tx: Tx, id: string) => {
  const [article] = await tx
    .select({ ...detailColumns, topicId: kbCategories.topicId })
    .from(kbArticles)
    .innerJoin(kbCategories, eq(kbCategories.id, kbArticles.categoryId))
    .where(eq(kbArticles.id, id));

  if (!article) throw new ORPCError('NOT_FOUND', { message: 'No such article' });

  return article;
};

/**
 * The status columns a change writes. Scheduling needs a time ahead; moving
 * into `publish` stamps the time; any other status drops the schedule.
 */
const statusColumns = (
  status: z.infer<typeof Status>,
  scheduledAt: Date | null | undefined,
  current?: { status: string; publishedAt: Date | null },
) => {
  if (status === 'scheduled') {
    if (!scheduledAt || scheduledAt <= new Date())
      throw new ORPCError('BAD_REQUEST', { message: 'Pick a time in the future to publish' });

    return { status, scheduledAt, publishedAt: null };
  }

  const publishes = status === 'publish' && current?.status !== 'publish';

  return {
    status,
    scheduledAt: null,
    publishedAt: publishes ? new Date() : (current?.publishedAt ?? null),
  };
};

const order = orderOf(kbArticles);

/**
 * A topic's articles, newest first, `limit` at a time: pass `nextCursor` as
 * `cursor` for the next page. The filter bar narrows them; `search` matches
 * title, summary or content, ignoring case.
 */
const list = reads(PERMISSIONS.kbView)
  .input(z.object({ topicId: z.string(), ...FilterInput, ...PageInput }))
  .output(
    z.object({
      articles: z.array(Article),
      ...PageOutput,
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    await topicFor(tx, input.topicId);

    const inTopic = tx
      .select({ id: kbCategories.id })
      .from(kbCategories)
      .where(eq(kbCategories.topicId, input.topicId));

    const matches = and(
      inArray(kbArticles.categoryId, inTopic),
      compileFilter(ARTICLE_FILTER, input.filter, { me: member.userId }),
      input.search
        ? or(
            ilike(kbArticles.title, likeText(input.search)),
            ilike(kbArticles.summary, likeText(input.search)),
            ilike(kbArticles.plainText, likeText(input.search)),
          )
        : undefined,
    );

    const rows = await tx
      .select(rowColumns)
      .from(kbArticles)
      .where(and(matches, order.after(input.cursor)))
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const totalCount = await firstPageCount(input.cursor, () =>
      tx.select({ value: count() }).from(kbArticles).where(matches),
    );

    const { items, nextCursor } = await order.page(tx, rows, input.limit);

    return {
      articles: items,
      nextCursor,
      totalCount,
    };
  });

/**
 * The published public articles that hold the words of `search`, best first: more words in the
 * title, then more words anywhere, then newest. Searches every topic, or only `topicId`'s. For
 * answering a question; `list` is the editor's list of every status.
 */
const search = reads(PERMISSIONS.kbView)
  .input(
    z.object({
      search: z.string().trim().min(1).max(200),
      topicId: z.string().optional(),
      limit: z.number().int().min(1).max(50).default(10),
    }),
  )
  .output(z.object({ articles: z.array(Article.extend({ topicId: z.string() })) }))
  .handler(async ({ input, context: { tx } }) => {
    if (input.topicId) await topicFor(tx, input.topicId);

    const { matches, rank } = articleSearch(input.search);

    const articles = await tx
      .select({ ...rowColumns, topicId: kbCategories.topicId })
      .from(kbArticles)
      .innerJoin(kbCategories, eq(kbCategories.id, kbArticles.categoryId))
      .where(and(matches, input.topicId ? eq(kbCategories.topicId, input.topicId) : undefined))
      .orderBy(...rank)
      .limit(input.limit);

    return { articles };
  });

/** One article with its content and files. */
const get = reads(PERMISSIONS.kbView)
  .input(z.object({ id: z.string() }))
  .output(Detail)
  .handler(({ input, context: { tx } }) => articleFor(tx, input.id));

const create = writes(PERMISSIONS.kbArticleManage)
  .input(Fields.required({ categoryId: true, title: true }))
  .output(Detail)
  .handler(
    async ({ input: { status = 'draft', scheduledAt, ...fields }, context: { tx, member } }) => {
      await categoryFor(tx, fields.categoryId);

      const [created] = await tx
        .insert(kbArticles)
        .values({
          ...fields,
          ...statusColumns(status, scheduledAt),
          orgId: member.orgId,
          createdBy: member.userId,
        })
        .returning({ id: kbArticles.id });

      if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

      return articleFor(tx, created.id);
    },
  );

/** Changes the fields given; a new status or schedule follows the publishing rules. */
const update = writes(PERMISSIONS.kbArticleManage)
  .input(Fields.extend({ id: z.string() }))
  .output(Detail)
  .handler(async ({ input: { id, status, scheduledAt, ...fields }, context: { tx } }) => {
    const current = await articleFor(tx, id);

    if (fields.categoryId) await categoryFor(tx, fields.categoryId);

    const publishing =
      status || scheduledAt !== undefined
        ? statusColumns(status ?? current.status, scheduledAt ?? current.scheduledAt, current)
        : {};

    await tx
      .update(kbArticles)
      .set({ ...fields, ...publishing })
      .where(eq(kbArticles.id, id));

    return articleFor(tx, id);
  });

/** Sets one status or category on many articles at once. Scheduling takes a time, so it's one at a time. */
const bulkUpdate = writes(PERMISSIONS.kbArticleManage)
  .input(
    z.object({
      ids: z.array(z.string()).min(1).max(500),
      status: Status.exclude(['scheduled']).optional(),
      categoryId: z.string().optional(),
    }),
  )
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input: { ids, status, categoryId }, context: { tx } }) => {
    if (categoryId) await categoryFor(tx, categoryId);

    const publishedAt =
      status === 'publish'
        ? sql`case when ${kbArticles.status} = 'publish' then ${kbArticles.publishedAt} else now() end`
        : undefined;

    const updated = await tx
      .update(kbArticles)
      .set({ categoryId, ...(status && { status, scheduledAt: null, publishedAt }) })
      .where(inArray(kbArticles.id, ids))
      .returning({ id: kbArticles.id });

    return { ids: updated.map((row) => row.id) };
  });

/** A draft copy of an article under `title`, with no views. */
const duplicate = writes(PERMISSIONS.kbArticleManage)
  .input(z.object({ id: z.string(), title: Title }))
  .output(Detail)
  .handler(async ({ input, context: { tx, member } }) => {
    const {
      id,
      topicId,
      status,
      scheduledAt,
      publishedAt,
      viewCount,
      createdAt,
      updatedAt,
      ...source
    } = await articleFor(tx, input.id);

    const [copy] = await tx
      .insert(kbArticles)
      .values({ ...source, title: input.title, orgId: member.orgId, createdBy: member.userId })
      .returning({ id: kbArticles.id });

    if (!copy) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return articleFor(tx, copy.id);
  });

/** Deletes the articles. */
const remove = writes(PERMISSIONS.kbArticleManage)
  .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx } }) => {
    const removed = await tx
      .delete(kbArticles)
      .where(inArray(kbArticles.id, input.ids))
      .returning({ id: kbArticles.id });

    return { ids: removed.map((row) => row.id) };
  });

export const articleProcedures = {
  list,
  search,
  get,
  create,
  update,
  bulkUpdate,
  duplicate,
  remove,
};
