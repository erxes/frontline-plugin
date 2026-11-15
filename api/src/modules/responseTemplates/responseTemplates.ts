import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, count, eq, getTableColumns, ilike, inArray, or } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { responseTemplates } from '#/db/schema.ts';
import { reads, writes } from '#/orpc.ts';
import { channelFor } from '../channels/access.ts';
import { likeText } from '../filter.ts';
import { after, newestFirst, PageInput, pageOf } from '../paging.ts';

const { orgId, ...templateColumns } = getTableColumns(responseTemplates);

const Name = z.string().trim().min(1).max(200);
const Content = z.string().max(100_000);

const Template = z.object({
  id: z.string(),
  channelId: z.string(),
  name: Name,
  content: Content,
  createdBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * The template `member` may act on: its channel's members read it, the
 * channel's admins and members who manage every channel change it.
 */
const templateFor = async (
  tx: Tx,
  member: PluginMember,
  id: string,
  { change }: { change: boolean },
) => {
  const [template] = await tx
    .select(templateColumns)
    .from(responseTemplates)
    .where(eq(responseTemplates.id, id));

  if (!template) throw new ORPCError('NOT_FOUND', { message: 'No such response template' });

  await channelFor(tx, member, template.channelId, { change });

  return template;
};

/**
 * A channel's templates, newest first, `limit` at a time: pass the last `id` as
 * `cursor` for the next page. `search` keeps those whose name or content
 * contains it, ignoring case.
 */
const list = reads(PERMISSIONS.channelView)
  .input(
    z.object({
      channelId: z.string(),
      search: z.string().trim().max(200).optional(),
      ...PageInput,
    }),
  )
  .output(
    z.object({
      templates: z.array(Template),
      nextCursor: z.string().nullable(),
      totalCount: z.number(),
      canManage: z.boolean(),
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    const { role } = await channelFor(tx, member, input.channelId, { change: false });

    const matches = and(
      eq(responseTemplates.channelId, input.channelId),
      input.search
        ? or(
            ilike(responseTemplates.name, likeText(input.search)),
            ilike(responseTemplates.content, likeText(input.search)),
          )
        : undefined,
    );

    const rows = await tx
      .select(templateColumns)
      .from(responseTemplates)
      .where(and(matches, after(responseTemplates, input.cursor)))
      .orderBy(...newestFirst(responseTemplates))
      .limit(input.limit + 1);

    const [total] = await tx.select({ value: count() }).from(responseTemplates).where(matches);
    const { items, nextCursor } = pageOf(rows, input.limit);

    return {
      templates: items,
      nextCursor,
      totalCount: total?.value ?? 0,
      canManage: role === 'admin' || member.can(PERMISSIONS.channelManage),
    };
  });

/** One template. */
const get = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Template)
  .handler(({ input, context: { tx, member } }) =>
    templateFor(tx, member, input.id, { change: false }),
  );

/** A new template in a channel the caller is an admin of. */
const create = writes(PERMISSIONS.channelView)
  .input(z.object({ channelId: z.string(), name: Name, content: Content.default('') }))
  .output(Template)
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.channelId, { change: true });

    const [created] = await tx
      .insert(responseTemplates)
      .values({ ...input, orgId: member.orgId, createdBy: member.userId })
      .returning(templateColumns);

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return created;
  });

/** Renames a template, changes its content, or moves it to another channel the caller is an admin of. */
const update = writes(PERMISSIONS.channelView)
  .input(
    z.object({
      id: z.string(),
      name: Name.optional(),
      content: Content.optional(),
      channelId: z.string().optional(),
    }),
  )
  .output(Template)
  .handler(async ({ input: { id, ...fields }, context: { tx, member } }) => {
    const template = await templateFor(tx, member, id, { change: true });

    if (fields.channelId && fields.channelId !== template.channelId)
      await channelFor(tx, member, fields.channelId, { change: true });

    const [updated] = await tx
      .update(responseTemplates)
      .set(fields)
      .where(eq(responseTemplates.id, id))
      .returning(templateColumns);

    if (!updated) throw new ORPCError('NOT_FOUND', { message: 'No such response template' });

    return updated;
  });

/** Deletes the templates, all of them or none when the caller may not delete one. */
const remove = writes(PERMISSIONS.channelView)
  .input(z.object({ ids: z.array(z.string()).min(1).max(500) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member } }) => {
    await Promise.all(input.ids.map((id) => templateFor(tx, member, id, { change: true })));

    const removed = await tx
      .delete(responseTemplates)
      .where(inArray(responseTemplates.id, input.ids))
      .returning({ id: responseTemplates.id });

    return { ids: removed.map((row) => row.id) };
  });

export const responseTemplateProcedures = { list, get, create, update, remove };
