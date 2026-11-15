import { ORPCError } from '@orpc/server';
import { asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { kbTopics } from '#/db/schema.ts';
import { reads, writes } from '#/orpc.ts';
import {
  Blank,
  Code,
  codeTaken,
  kbErrors,
  Stamps,
  Title,
  topicColumns,
  topicFor,
} from './shared.ts';

const Color = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .nullable();

const Fields = z
  .object({
    title: Title,
    description: Blank(1000),
    code: Code,
    color: Color,
    backgroundImage: Blank(2000),
    languageCode: z
      .string()
      .regex(/^[a-z]{2}$/)
      .nullable(),
  })
  .partial();

const Topic = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  code: z.string().nullable(),
  color: z.string().nullable(),
  backgroundImage: z.string().nullable(),
  languageCode: z.string().nullable(),
  ...Stamps,
});

/**
 * Every topic by title, and what the caller may change in the knowledge base,
 * so a screen hides the actions they would be refused.
 */
const list = reads(PERMISSIONS.kbView)
  .input(z.object({}))
  .output(
    z.object({
      topics: z.array(Topic),
      can: z.object({ topics: z.boolean(), categories: z.boolean(), articles: z.boolean() }),
    }),
  )
  .handler(async ({ context: { tx, member } }) => ({
    topics: await tx
      .select(topicColumns)
      .from(kbTopics)
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
  .handler(({ input, context: { tx } }) => topicFor(tx, input.id));

const create = writes(PERMISSIONS.kbTopicManage)
  .errors(kbErrors)
  .input(Fields.required({ title: true }))
  .output(Topic)
  .handler(async ({ input, context: { tx, member }, errors }) => {
    const [created] = await tx
      .insert(kbTopics)
      .values({ ...input, orgId: member.orgId, createdBy: member.userId })
      .returning(topicColumns)
      .catch(codeTaken(errors, input.code));

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return created;
  });

/** Changes the fields given. */
const update = writes(PERMISSIONS.kbTopicManage)
  .errors(kbErrors)
  .input(Fields.extend({ id: z.string() }))
  .output(Topic)
  .handler(async ({ input: { id, ...fields }, context: { tx }, errors }) => {
    const [updated] = await tx
      .update(kbTopics)
      .set(fields)
      .where(eq(kbTopics.id, id))
      .returning(topicColumns)
      .catch(codeTaken(errors, fields.code));

    if (!updated) throw new ORPCError('NOT_FOUND', { message: 'No such topic' });

    return updated;
  });

/** Deletes the topic with its categories and their articles. */
const remove = writes(PERMISSIONS.kbTopicManage)
  .input(z.object({ id: z.string() }))
  .output(z.object({ id: z.string() }))
  .handler(async ({ input, context: { tx } }) => {
    const [removed] = await tx
      .delete(kbTopics)
      .where(eq(kbTopics.id, input.id))
      .returning({ id: kbTopics.id });

    if (!removed) throw new ORPCError('NOT_FOUND', { message: 'No such topic' });

    return removed;
  });

export const topicProcedures = { list, get, create, update, remove };
