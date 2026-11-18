import { ORPCError } from '@orpc/server';
import { and, asc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { kbArticles, kbCategories } from '#/db/schema.ts';
import { reads, writes } from '#/orpc.ts';
import { Blank, Title } from '../fields.ts';
import { compileFilter, type FilterFields } from '@erxes/plugin-sdk/filter';
import { FilterInput, likeText } from '../filter.ts';
import {
  categoryColumns,
  categoryFor,
  Code,
  codeTaken,
  kbErrors,
  lockTopics,
  topicFor,
} from './shared.ts';

const Fields = z
  .object({
    topicId: z.string(),
    /** Null puts the category at its topic's top level. */
    parentId: z.string().nullable(),
    title: Title,
    description: Blank(1000),
    code: Code,
    icon: Blank(100),
  })
  .partial();

/** The row, with the articles in it and its subcategories, which the query counts. */
const Category = createSelectSchema(kbCategories)
  .omit({ orgId: true })
  .extend({ articleCount: z.number() });

/** The ids of `id` and every category under it. UNION stops on a cycle an import brought in. */
const subtreeIds = async (tx: Tx, id: string) => {
  const { rows } = await tx.execute<{ id: string }>(sql`
    with recursive sub(id) as (
      select ${id}::text
      union
      select child.id from ${kbCategories} child join sub on child.parent_id = sub.id
    )
    select id from sub`);

  return rows.map((row) => row.id);
};

/**
 * Refuses a parent that isn't in the category's topic, or one that is the
 * category itself or under it, which would make a loop.
 */
const checkParent = async (tx: Tx, topicId: string, parentId: string | null, id?: string) => {
  if (!parentId) return;

  const parent = await categoryFor(tx, parentId);

  if (parent.topicId !== topicId)
    throw new ORPCError('BAD_REQUEST', { message: 'The parent category is in another topic' });

  if (id && (await subtreeIds(tx, id)).includes(parentId))
    throw new ORPCError('BAD_REQUEST', {
      message: "A category can't go under itself or its subcategories",
    });
};

/**
 * Categories, each counting the articles in it and under it. UNION stops on a cycle. A one-table
 * select leaves columns bare, so the outer id is named.
 */
const categoryRows = (tx: Tx) =>
  tx
    .select({
      ...categoryColumns,
      articleCount: sql<number>`(
        select count(*)::int from ${kbArticles} filed where filed.category_id in (
          with recursive sub(id) as (
            select ${kbCategories}.id
            union
            select child.id from ${kbCategories} child join sub on child.parent_id = sub.id
          )
          select id from sub
        )
      )`,
    })
    .from(kbCategories)
    .$dynamic();

const categoryById = async (tx: Tx, id: string) => {
  const [category] = await categoryRows(tx).where(eq(kbCategories.id, id));

  if (!category) throw new ORPCError('NOT_FOUND', { message: 'No such category' });

  return category;
};

/** What the categories list's filter bar narrows them by (`CategoriesPage.tsx` in the UI). */
const CATEGORY_FILTER: FilterFields = {
  'subject.title': { type: 'text', expr: kbCategories.title },
  'subject.description': { type: 'text', expr: kbCategories.description },
  'subject.code': { type: 'text', expr: kbCategories.code },
  'subject.parentId': { type: 'select', expr: kbCategories.parentId },
  'subject.createdBy': { type: 'member', expr: kbCategories.createdBy },
  'subject.createdAt': { type: 'date', expr: kbCategories.createdAt },
};

/**
 * A topic's categories by title, each counting the articles in it and its subcategories,
 * narrowed by the filter bar: `search` matches the title or description, ignoring case.
 */
const list = reads(PERMISSIONS.kbView)
  .input(z.object({ topicId: z.string(), ...FilterInput }))
  .output(z.object({ categories: z.array(Category) }))
  .handler(async ({ input, context: { tx, member } }) => {
    await topicFor(tx, input.topicId);

    const categories = await categoryRows(tx)
      .where(
        and(
          eq(kbCategories.topicId, input.topicId),
          input.search
            ? or(
                ilike(kbCategories.title, likeText(input.search)),
                ilike(kbCategories.description, likeText(input.search)),
              )
            : undefined,
          compileFilter(CATEGORY_FILTER, input.filter, { me: member.userId }),
        ),
      )
      .orderBy(asc(sql`lower(${kbCategories.title})`), asc(kbCategories.id));

    return { categories };
  });

/** One category. */
const get = reads(PERMISSIONS.kbView)
  .input(z.object({ id: z.string() }))
  .output(Category)
  .handler(({ input, context: { tx } }) => categoryById(tx, input.id));

const create = writes(PERMISSIONS.kbCategoryManage)
  .errors(kbErrors)
  .input(Fields.required({ topicId: true, title: true }))
  .output(Category)
  .handler(async ({ input, context: { tx, member }, errors }) => {
    await topicFor(tx, input.topicId, { lock: true });
    await checkParent(tx, input.topicId, input.parentId ?? null);

    const [created] = await tx
      .insert(kbCategories)
      .values({ ...input, orgId: member.orgId, createdBy: member.userId })
      .returning({ id: kbCategories.id })
      .catch(codeTaken(errors, input.code));

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return categoryById(tx, created.id);
  });

/**
 * Changes the fields given. A category moved to another topic takes its
 * subcategories and their articles along, and goes to the top level unless
 * `parentId` names a category there.
 */
const update = writes(PERMISSIONS.kbCategoryManage)
  .errors(kbErrors)
  .input(Fields.extend({ id: z.string() }))
  .output(Category)
  .handler(async ({ input: { id, ...fields }, context: { tx }, errors }) => {
    const current = await categoryFor(tx, id);
    const topicId = fields.topicId ?? current.topicId;
    const moves = topicId !== current.topicId;

    await lockTopics(tx, [current.topicId, topicId]);

    if (moves) await topicFor(tx, topicId);

    const parentId = fields.parentId === undefined && !moves ? current.parentId : fields.parentId;

    await checkParent(tx, topicId, parentId ?? null, id);

    const subtree = moves ? await subtreeIds(tx, id) : [];

    await tx
      .update(kbCategories)
      .set({ ...fields, parentId: parentId ?? null })
      .where(eq(kbCategories.id, id))
      .catch(codeTaken(errors, fields.code));

    if (moves)
      await tx.update(kbCategories).set({ topicId }).where(inArray(kbCategories.id, subtree));

    return categoryById(tx, id);
  });

/** Deletes the categories with their articles; their subcategories move to the top level. */
const remove = writes(PERMISSIONS.kbCategoryManage)
  .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx } }) => {
    const removed = await tx
      .delete(kbCategories)
      .where(inArray(kbCategories.id, input.ids))
      .returning({ id: kbCategories.id });

    return { ids: removed.map((row) => row.id) };
  });

export const categoryProcedures = { list, get, create, update, remove };
