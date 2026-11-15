import { ORPCError } from '@orpc/server';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { kbArticles, kbCategories } from '#/db/schema.ts';
import { reads, writes } from '#/orpc.ts';
import {
  Blank,
  categoryColumns,
  categoryFor,
  Code,
  codeTaken,
  kbErrors,
  lockTopics,
  Stamps,
  Title,
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

const Category = z.object({
  id: z.string(),
  topicId: z.string(),
  parentId: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  code: z.string().nullable(),
  icon: z.string().nullable(),
  ...Stamps,
});

/** The ids of `id` and every category under it. UNION stops on a cycle an import brought in. */
export const subtreeIds = async (tx: Tx, id: string) => {
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

/** Each row's article count with its subcategories' counts added in. */
const withSubtreeCounts = <T extends { id: string; parentId: string | null; own: number }>(
  rows: T[],
) => {
  const children = Map.groupBy(rows, (row) => row.parentId);

  const total = (row: T, seen: Set<string>): number => {
    if (seen.has(row.id)) return 0;

    seen.add(row.id);

    return (children.get(row.id) ?? []).reduce((sum, child) => sum + total(child, seen), row.own);
  };

  return rows.map((row) => {
    const { own, ...fields } = row;

    return { ...fields, articleCount: total(row, new Set()) };
  });
};

/** A topic's categories by title, each counting the articles in it and its subcategories. */
const list = reads(PERMISSIONS.kbView)
  .input(z.object({ topicId: z.string() }))
  .output(z.object({ categories: z.array(Category.extend({ articleCount: z.number() })) }))
  .handler(async ({ input, context: { tx } }) => {
    await topicFor(tx, input.topicId);

    const rows = await tx
      .select({
        ...categoryColumns,
        own: sql<number>`(
          select count(*)::int from ${kbArticles} filed where filed.category_id = ${kbCategories}.id
        )`,
      })
      .from(kbCategories)
      .where(eq(kbCategories.topicId, input.topicId))
      .orderBy(asc(sql`lower(${kbCategories.title})`), asc(kbCategories.id));

    return { categories: withSubtreeCounts(rows) };
  });

/** One category. */
const get = reads(PERMISSIONS.kbView)
  .input(z.object({ id: z.string() }))
  .output(Category)
  .handler(({ input, context: { tx } }) => categoryFor(tx, input.id));

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
      .returning(categoryColumns)
      .catch(codeTaken(errors, input.code));

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return created;
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

    return categoryFor(tx, id);
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
