import { ORPCError, type ORPCErrorConstructorMap } from '@orpc/server';
import { eq, getTableColumns, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { type Tx, uniqueViolation } from '#/db/client.ts';
import {
  KB_CATEGORY_CODE_INDEX,
  KB_TOPIC_CODE_INDEX,
  kbCategories,
  kbTopics,
} from '#/db/schema.ts';

const { orgId: topicOrg, ...topicColumns } = getTableColumns(kbTopics);
const { orgId: categoryOrg, ...categoryColumns } = getTableColumns(kbCategories);

/** What procedures return: the rows without `org_id`, which the caller already knows. */
export { categoryColumns, topicColumns };

export const Title = z.string().trim().min(1).max(200);

/** Optional text: blank becomes null, so a cleared field reads as unset. */
export const Blank = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

/** A short code for embeds and links, unique in the organisation. */
export const Code = Blank(100);

export const Stamps = { createdBy: z.string(), createdAt: z.date(), updatedAt: z.date() };

/** The failures a client can branch on: `isDefinedError(error) && error.code === ...`. */
export const kbErrors = {
  CODE_TAKEN: {
    status: 409,
    message: 'Another record has this code',
    data: z.object({ code: z.string() }),
  },
};

/** Postgres's 23505 on a code index becomes CODE_TAKEN; any other error passes on. */
export const codeTaken =
  (errors: ORPCErrorConstructorMap<typeof kbErrors>, code: string | null | undefined) =>
  (error: unknown): never => {
    const index = uniqueViolation(error);

    if (code && (index === KB_TOPIC_CODE_INDEX || index === KB_CATEGORY_CODE_INDEX))
      throw errors.CODE_TAKEN({ data: { code } });

    throw error;
  };

/** The topic, or NOT_FOUND. `lock` holds it, so changes to its category tree run one at a time. */
export const topicFor = async (tx: Tx, id: string, { lock = false } = {}) => {
  const query = tx.select(topicColumns).from(kbTopics).where(eq(kbTopics.id, id));
  const [topic] = await (lock ? query.for('update') : query);

  if (!topic) throw new ORPCError('NOT_FOUND', { message: 'No such topic' });

  return topic;
};

/** Holds the topics, in id order so two moves between the same topics can't deadlock. */
export const lockTopics = async (tx: Tx, ids: string[]) => {
  await tx
    .select({ id: kbTopics.id })
    .from(kbTopics)
    .where(inArray(kbTopics.id, ids))
    .orderBy(kbTopics.id)
    .for('update');
};

/** The category, or NOT_FOUND. */
export const categoryFor = async (tx: Tx, id: string) => {
  const [category] = await tx
    .select(categoryColumns)
    .from(kbCategories)
    .where(eq(kbCategories.id, id));

  if (!category) throw new ORPCError('NOT_FOUND', { message: 'No such category' });

  return category;
};
