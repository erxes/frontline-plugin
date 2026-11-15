import { ORPCError } from '@orpc/server';
import { and, count, eq, getTableColumns, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { KB_ARTICLE_STATUSES, kbArticles, kbCategories } from '#/db/schema.ts';
import { reads, writes } from '#/orpc.ts';
import { likeText } from '../channels/access.ts';
import { subtreeIds } from './categories.ts';
import { Attachment, Blank, Stamps, Title } from '../fields.ts';
import { after, newestFirst, PageInput, pageOf } from '../paging.ts';
import { categoryFor, topicFor } from './shared.ts';

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

/** An article as lists show it, without its content and files. */
const Article = z.object({
  id: z.string(),
  categoryId: z.string(),
  title: z.string(),
  summary: z.string().nullable(),
  status: Status,
  scheduledAt: z.date().nullable(),
  publishedAt: z.date().nullable(),
  isPrivate: z.boolean(),
  viewCount: z.number(),
  ...Stamps,
});

const Detail = Article.extend({
  content: z.string(),
  reactionChoices: z.array(z.string()),
  image: Attachment.nullable(),
  attachments: z.array(Attachment),
  pdfAttachment: z.object({ pdf: Attachment }).nullable(),
});

/**
 * Publishes the scheduled articles whose time has come, as of that time.
 * Every read runs it first, so no job or queue has to.
 */
const publishDue = (tx: Tx) =>
  tx
    .update(kbArticles)
    .set({ status: 'publish', publishedAt: sql`${kbArticles.scheduledAt}`, scheduledAt: null })
    .where(and(eq(kbArticles.status, 'scheduled'), lte(kbArticles.scheduledAt, sql`now()`)));

const articleFor = async (tx: Tx, id: string) => {
  await publishDue(tx);

  const [article] = await tx.select(detailColumns).from(kbArticles).where(eq(kbArticles.id, id));

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

/**
 * A topic's articles, newest first, `limit` at a time: pass `nextCursor` as
 * `cursor` for the next page. `categoryId` keeps a category's articles with
 * its subcategories'; `search` matches title, summary or content, ignoring case.
 */
const list = reads(PERMISSIONS.kbView)
  .input(
    z.object({
      topicId: z.string(),
      categoryId: z.string().optional(),
      status: Status.optional(),
      search: z.string().trim().max(200).optional(),
      ...PageInput,
    }),
  )
  .output(
    z.object({
      articles: z.array(Article),
      nextCursor: z.string().nullable(),
      totalCount: z.number(),
    }),
  )
  .handler(async ({ input, context: { tx } }) => {
    await publishDue(tx);
    await topicFor(tx, input.topicId);

    const inTopic = tx
      .select({ id: kbCategories.id })
      .from(kbCategories)
      .where(eq(kbCategories.topicId, input.topicId));

    const matches = and(
      inArray(kbArticles.categoryId, inTopic),
      input.categoryId
        ? inArray(kbArticles.categoryId, await subtreeIds(tx, input.categoryId))
        : undefined,
      input.status ? eq(kbArticles.status, input.status) : undefined,
      input.search
        ? or(
            ilike(kbArticles.title, likeText(input.search)),
            ilike(kbArticles.summary, likeText(input.search)),
            ilike(kbArticles.content, likeText(input.search)),
          )
        : undefined,
    );

    const rows = await tx
      .select(rowColumns)
      .from(kbArticles)
      .where(and(matches, after(kbArticles, input.cursor)))
      .orderBy(...newestFirst(kbArticles))
      .limit(input.limit + 1);

    const [total] = await tx.select({ value: count() }).from(kbArticles).where(matches);
    const { items, nextCursor } = pageOf(rows, input.limit);

    return {
      articles: items,
      nextCursor,
      totalCount: total?.value ?? 0,
    };
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
        .returning(detailColumns);

      if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

      return created;
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

    const [updated] = await tx
      .update(kbArticles)
      .set({ ...fields, ...publishing })
      .where(eq(kbArticles.id, id))
      .returning(detailColumns);

    if (!updated) throw new ORPCError('NOT_FOUND', { message: 'No such article' });

    return updated;
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
    const { id, status, scheduledAt, publishedAt, viewCount, createdAt, updatedAt, ...source } =
      await articleFor(tx, input.id);

    const [copy] = await tx
      .insert(kbArticles)
      .values({ ...source, title: input.title, orgId: member.orgId, createdBy: member.userId })
      .returning(detailColumns);

    if (!copy) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return copy;
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

export const articleProcedures = { list, get, create, update, bulkUpdate, duplicate, remove };
