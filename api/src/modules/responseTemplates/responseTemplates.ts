import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, count, eq, getTableColumns, ilike, inArray, or, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { channelMembers, responseTemplates } from '#/db/schema.ts';
import { reads, writes } from '#/orpc.ts';
import { channelFor, managesAll } from '../channels/access.ts';
import { FilterInput, type FilterFields, filterSql, likeText } from '../filter.ts';
import { orderOf, PageInput } from '../paging.ts';

/** The row without `org_id`, which the caller already knows. */
const { orgId, ...templateColumns } = getTableColumns(responseTemplates);

const Name = z.string().trim().min(1).max(200);
const Content = z.string().max(100_000);

/** The row, with whether the caller may change it, which the query selects. */
const Template = createSelectSchema(responseTemplates).omit({ orgId: true }).extend({
  /** Whether the caller is its channel's admin or manages every channel. */
  canManage: z.boolean(),
});

/**
 * The words a member reads in the content: the text of erxes-ui's editor blocks, so a search
 * doesn't match their JSON keys. Content that isn't blocks is its own text.
 */
const contentText = sql<string>`case
  when pg_input_is_valid(${responseTemplates.content}, 'jsonb')
    and jsonb_typeof(${responseTemplates.content}::jsonb) = 'array'
  then coalesce((
    select string_agg(part #>> '{}', ' ')
    from jsonb_path_query(${responseTemplates.content}::jsonb, 'strict $.** ? (@.type == "text").text') part
  ), '')
  else ${responseTemplates.content}
end`;

/** Templates with whether `member` may change them, from their channel's membership. */
const templateRows = (tx: Tx, member: PluginMember) =>
  tx
    .select({
      ...templateColumns,
      canManage: sql<boolean>`(${channelMembers.role} = 'admin') is true or ${managesAll(member)}`,
    })
    .from(responseTemplates)
    .leftJoin(
      channelMembers,
      and(
        eq(channelMembers.channelId, responseTemplates.channelId),
        eq(channelMembers.userId, member.userId),
      ),
    )
    .$dynamic();

/** One template as the caller sees it. */
const templateById = async (tx: Tx, member: PluginMember, id: string) => {
  const [row] = await templateRows(tx, member).where(eq(responseTemplates.id, id));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such response template' });

  return row;
};

/**
 * The channel of the template `member` may act on: its channel's members read it, the
 * channel's admins and members who manage every channel change it.
 */
const templateFor = async (
  tx: Tx,
  member: PluginMember,
  id: string,
  { change }: { change: boolean },
) => {
  const [template] = await tx
    .select({ channelId: responseTemplates.channelId })
    .from(responseTemplates)
    .where(eq(responseTemplates.id, id));

  if (!template) throw new ORPCError('NOT_FOUND', { message: 'No such response template' });

  await channelFor(tx, member, template.channelId, { change });

  return template;
};

/** What the list's filter bar narrows templates by (`ui/src/modules/responseTemplates`). */
const TEMPLATE_FILTER: FilterFields = {
  'subject.name': { kind: 'text', expr: responseTemplates.name },
  'subject.content': { kind: 'text', expr: contentText },
  'subject.createdBy': { kind: 'member', expr: responseTemplates.createdBy },
  'subject.createdAt': { kind: 'date', expr: responseTemplates.createdAt },
  'subject.updatedAt': { kind: 'date', expr: responseTemplates.updatedAt },
};

const order = orderOf(responseTemplates);

/**
 * A channel's templates, newest first, `limit` at a time, narrowed by the filter bar: pass
 * `nextCursor` as `cursor` for the next page. `search` matches the name or the content's text,
 * ignoring case.
 */
const list = reads(PERMISSIONS.channelView)
  .input(z.object({ channelId: z.string(), ...FilterInput, ...PageInput }))
  .output(
    z.object({
      templates: z.array(Template),
      nextCursor: z.string().nullable(),
      totalCount: z.number(),
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.channelId, { change: false });

    const matches = and(
      eq(responseTemplates.channelId, input.channelId),
      input.search
        ? or(
            ilike(responseTemplates.name, likeText(input.search)),
            ilike(contentText, likeText(input.search)),
          )
        : undefined,
      input.filter ? filterSql(TEMPLATE_FILTER, input.filter, member.userId) : undefined,
    );

    const rows = await templateRows(tx, member)
      .where(and(matches, order.after(input.cursor)))
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const [total] = await tx.select({ value: count() }).from(responseTemplates).where(matches);
    const { items, nextCursor } = await order.page(tx, rows, input.limit);

    return { templates: items, nextCursor, totalCount: total?.value ?? 0 };
  });

/** One template. */
const get = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(Template)
  .handler(async ({ input, context: { tx, member } }) => {
    await templateFor(tx, member, input.id, { change: false });

    return templateById(tx, member, input.id);
  });

/** A new template in a channel the caller is an admin of. */
const create = writes(PERMISSIONS.channelView)
  .input(z.object({ channelId: z.string(), name: Name, content: Content.default('') }))
  .output(Template)
  .handler(async ({ input, context: { tx, member } }) => {
    await channelFor(tx, member, input.channelId, { change: true });

    const [created] = await tx
      .insert(responseTemplates)
      .values({ ...input, orgId: member.orgId, createdBy: member.userId })
      .returning({ id: responseTemplates.id });

    if (!created) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return templateById(tx, member, created.id);
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

    await tx.update(responseTemplates).set(fields).where(eq(responseTemplates.id, id));

    return templateById(tx, member, id);
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
