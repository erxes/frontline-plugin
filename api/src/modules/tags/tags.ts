import { type ORPCErrorConstructorMap, ORPCError } from '@orpc/server';
import { and, asc, eq, getTableColumns, ilike, inArray, sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { type Tx, uniqueViolation } from '#/db/client.ts';
import { TAG_NAME_INDEX, TAG_TYPES, tags } from '#/db/tags.ts';
import { tickets } from '#/db/tickets.ts';
import { reads, writes } from '#/orpc.ts';
import { Color, Title } from '../fields.ts';
import { FilterInput, type FilterFields, filterSql, likeText } from '../filter.ts';

const { orgId, ...tagColumns } = getTableColumns(tags);

const Tag = createSelectSchema(tags).omit({ orgId: true });

const refine = { name: () => Title, colorCode: () => Color.nullable() };

const tagErrors = {
  TAG_NAME_TAKEN: {
    status: 409,
    message: 'Another tag has this name',
    data: z.object({ name: z.string() }),
  },
};

/** The one place Postgres's 23505 on the name index becomes TAG_NAME_TAKEN. */
const nameTaken =
  (errors: ORPCErrorConstructorMap<typeof tagErrors>, name: string | undefined) =>
  (error: unknown): never => {
    if (uniqueViolation(error) === TAG_NAME_INDEX)
      throw errors.TAG_NAME_TAKEN({ data: { name: name ?? '' } });

    throw error;
  };

const tagById = async (tx: Tx, id: string) => {
  const [row] = await tx.select(tagColumns).from(tags).where(eq(tags.id, id));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such tag' });

  return row;
};

/** Refuses ids that aren't tags of `type`, so a record holds only real tags. */
export const assertTags = async (tx: Tx, type: (typeof TAG_TYPES)[number], ids: string[]) => {
  if (ids.length === 0) return;

  const found = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.type, type), inArray(tags.id, ids)));

  if (found.length !== new Set(ids).size)
    throw new ORPCError('BAD_REQUEST', { message: 'Pick tags of this list' });
};

const TAG_FILTER: FilterFields = {
  'subject.name': { kind: 'text', expr: tags.name },
  'subject.createdBy': { kind: 'member', expr: tags.createdBy },
  'subject.createdAt': { kind: 'date', expr: tags.createdAt },
};

/**
 * The tags of one type, by name, narrowed by the filter bar, as core's `tags.list` gives them so
 * erxes-ui's tag pickers and filters take the query. Every member reads them.
 */
const list = reads(PERMISSIONS.channelView)
  .input(z.object({ type: z.enum(TAG_TYPES), ...FilterInput }))
  .output(z.object({ data: z.array(Tag) }))
  .handler(async ({ input, context: { tx, member } }) => ({
    data: await tx
      .select(tagColumns)
      .from(tags)
      .where(
        and(
          eq(tags.type, input.type),
          input.search ? ilike(tags.name, likeText(input.search)) : undefined,
          input.filter ? filterSql(TAG_FILTER, input.filter, member.userId) : undefined,
        ),
      )
      .orderBy(asc(sql`lower(${tags.name})`)),
  }));

const get = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Tag)
  .handler(({ input, context: { tx } }) => tagById(tx, input.id));

const create = writes(PERMISSIONS.settingsManage)
  .errors(tagErrors)
  .input(
    createInsertSchema(tags, refine)
      .pick({ type: true, name: true, colorCode: true })
      .partial({ colorCode: true }),
  )
  .output(Tag)
  .handler(async ({ input, context: { tx, member }, errors }) => {
    const [row] = await tx
      .insert(tags)
      .values({ ...input, orgId: member.orgId, createdBy: member.userId })
      .returning(tagColumns)
      .catch(nameTaken(errors, input.name));

    if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return row;
  });

const update = writes(PERMISSIONS.settingsManage)
  .errors(tagErrors)
  .input(
    createUpdateSchema(tags, refine)
      .pick({ name: true, colorCode: true })
      .extend({ id: z.string() }),
  )
  .output(Tag)
  .handler(async ({ input: { id, ...fields }, context: { tx }, errors }) => {
    await tagById(tx, id);
    await tx.update(tags).set(fields).where(eq(tags.id, id)).catch(nameTaken(errors, fields.name));

    return tagById(tx, id);
  });

/** Deletes the tags and takes them off every ticket, in one transaction. */
const remove = writes(PERMISSIONS.settingsManage)
  .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx } }) => {
    const removed = await tx
      .delete(tags)
      .where(inArray(tags.id, input.ids))
      .returning({ id: tags.id });

    const ids = removed.map((row) => row.id);

    if (ids.length > 0)
      await tx
        .update(tickets)
        .set({
          tagIds: sql`array(select unnest(${tickets.tagIds}) except select unnest(${sql.param(ids)}::text[]))`,
        })
        .where(sql`${tickets.tagIds} && ${sql.param(ids)}::text[]`);

    return { ids };
  });

export const tagProcedures = { list, get, create, update, remove };
