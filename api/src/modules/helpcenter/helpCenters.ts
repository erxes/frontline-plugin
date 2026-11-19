import { randomBytes } from 'node:crypto';
import { ORPCError } from '@orpc/server';
import { and, count, eq, getTableColumns, ilike, inArray, sql } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
import { config } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import {
  DomainRecord,
  HelpCenterFooter,
  HelpCenterHeader,
  HELP_CENTER_DOMAIN,
  HELP_CENTER_KEY,
  HelpCenterStyles,
  helpCenters,
} from '#/db/helpcenter.ts';
import { forms } from '#/db/forms.ts';
import { integrations } from '#/db/inbox.ts';
import { publicKeys } from '#/db/public.ts';
import { kbTopics } from '#/db/schema.ts';
import { reads, writes, writesWithCore } from '#/orpc.ts';
import { Blank, Color, LanguageCode, Title } from '../fields.ts';
import { compileFilter, type FilterFields } from '@erxes/plugin-sdk/filter';
import { FilterInput, likeText } from '../filter.ts';
import { messenger } from '../messenger/adapter.ts';
import { firstPageCount, orderOf, PageInput, PageOutput } from '../paging.ts';
import { removeKeys, widgetScript } from '../public.ts';
import {
  clearDomain,
  cnameTarget,
  connectDomain,
  domainsAvailable,
  dropHostname,
  recheckDomain,
  recordDomain,
} from './domains.ts';

const { orgId, formIds, messengerId, ...columns } = getTableColumns(helpCenters);

/**
 * A help center's columns, its forms narrowed to those not deleted since, in order, and its
 * messenger to null once deleted.
 */
const centerColumns = {
  ...columns,
  formIds: sql<
    string[]
  >`array(select f.id from unnest(${formIds}) with ordinality as f(id, n) join ${forms} as live on live.id = f.id order by f.n)`,
  messengerId: sql<
    string | null
  >`(select i.id from ${integrations} as i where i.id = ${messengerId})`,
};

const refine = {
  title: () => Title,
  description: () => Blank(2000),
  languageCode: () => LanguageCode.nullable(),
  kbLabel: () => Blank(100),
  formIds: () => z.array(z.string()).max(50),
  color: () => Color.nullable(),
  backgroundImage: () => Blank(2000),
  styles: () => HelpCenterStyles,
  header: () => HelpCenterHeader,
  footer: () => HelpCenterFooter,
  domainRecords: () => z.array(DomainRecord),
};

const HelpCenter = createSelectSchema(helpCenters, refine).omit({ orgId: true }).extend({
  /** Where the member's domain must CNAME to. */
  cnameTarget: z.string(),
  /** Whether this installation connects domains through Cloudflare. */
  domainsAvailable: z.boolean(),
  /** The script a website adds to show the knowledge base. */
  scriptUrl: z.string(),
  /** The help center's site at its key's address, which works before any domain does. */
  siteUrl: z.string(),
});

const withTarget = <T extends { publicKey: string }>(row: T) => ({
  ...row,
  cnameTarget: cnameTarget(row.publicKey),
  domainsAvailable: domainsAvailable(),
  scriptUrl: widgetScript('knowledgebase', { key: row.publicKey }),
  siteUrl: `${config.publicUrl}/help/${row.publicKey}`,
});

const centerById = async (tx: Tx, id: string) => {
  const [row] = await tx.select(centerColumns).from(helpCenters).where(eq(helpCenters.id, id));

  if (!row) throw new ORPCError('NOT_FOUND', { message: 'No such help center' });

  return row;
};

const assertTopic = async (tx: Tx, topicId: string | null | undefined) => {
  if (!topicId) return;

  const [topic] = await tx
    .select({ id: kbTopics.id })
    .from(kbTopics)
    .where(eq(kbTopics.id, topicId));

  if (!topic) throw new ORPCError('BAD_REQUEST', { message: 'Pick a knowledge base topic' });
};

const assertMessenger = async (tx: Tx, id: string | null | undefined) => {
  if (!id) return;

  const [found] = await tx
    .select({ id: integrations.id })
    .from(integrations)
    .where(and(eq(integrations.id, id), eq(integrations.kind, messenger.kind)));

  if (!found) throw new ORPCError('BAD_REQUEST', { message: 'Pick a messenger' });
};

/** The forms picked, each once, after checking each is a form. */
const pickedForms = async (tx: Tx, ids: string[] | undefined) => {
  if (!ids?.length) return ids;

  const picked = [...new Set(ids)];
  const [found] = await tx.select({ value: count() }).from(forms).where(inArray(forms.id, picked));

  if (found?.value !== picked.length)
    throw new ORPCError('BAD_REQUEST', { message: 'Pick forms that still exist' });

  return picked;
};

const CENTER_FILTER: FilterFields = {
  'subject.title': { type: 'text', expr: helpCenters.title },
  'subject.kbTopicId': { type: 'select', expr: helpCenters.kbTopicId },
  'subject.hostname': { type: 'text', expr: helpCenters.hostname },
  'subject.createdBy': { type: 'member', expr: helpCenters.createdBy },
  'subject.createdAt': { type: 'date', expr: helpCenters.createdAt },
  'subject.updatedAt': { type: 'date', expr: helpCenters.updatedAt },
};

const order = orderOf(helpCenters);

/**
 * The help centers, newest first and a page at a time, narrowed by the filter bar, and whether the
 * caller manages them.
 */
const list = reads(PERMISSIONS.helpCenterView)
  .input(z.object({ ...FilterInput, ...PageInput }))
  .output(z.object({ helpCenters: z.array(HelpCenter), ...PageOutput, canManage: z.boolean() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const matches = and(
      input.search ? ilike(helpCenters.title, likeText(input.search)) : undefined,
      compileFilter(CENTER_FILTER, input.filter, { me: member.userId }),
    );

    const rows = await tx
      .select(centerColumns)
      .from(helpCenters)
      .where(and(matches, order.after(input.cursor)))
      .orderBy(...order.orderBy)
      .limit(input.limit + 1);

    const totalCount = await firstPageCount(input.cursor, () =>
      tx.select({ value: count() }).from(helpCenters).where(matches),
    );

    const { items, nextCursor } = await order.page(tx, rows, input.limit);

    return {
      helpCenters: items.map(withTarget),
      nextCursor,
      totalCount,
      canManage: member.can(PERMISSIONS.helpCenterManage),
    };
  });

const get = reads(PERMISSIONS.helpCenterView)
  .input(z.object({ id: z.string() }))
  .output(HelpCenter)
  .handler(async ({ input, context: { tx } }) => withTarget(await centerById(tx, input.id)));

const FIELDS = {
  title: true,
  description: true,
  languageCode: true,
  kbTopicId: true,
  kbLabel: true,
  formIds: true,
  messengerId: true,
  color: true,
  backgroundImage: true,
  styles: true,
  header: true,
  footer: true,
} as const;

/** A new help center, with the public key signed-out visitors reach it by. */
const create = writes(PERMISSIONS.helpCenterManage)
  .input(
    createInsertSchema(helpCenters, refine).pick(FIELDS).partial({
      description: true,
      languageCode: true,
      kbLabel: true,
      formIds: true,
      messengerId: true,
      color: true,
      backgroundImage: true,
      styles: true,
      header: true,
      footer: true,
    }),
  )
  .output(HelpCenter)
  .handler(async ({ input, context: { tx, member } }) => {
    await assertTopic(tx, input.kbTopicId);
    await assertMessenger(tx, input.messengerId);

    const publicKey = randomBytes(10).toString('hex');

    const [row] = await tx
      .insert(helpCenters)
      .values({
        ...input,
        formIds: await pickedForms(tx, input.formIds),
        publicKey,
        orgId: member.orgId,
        createdBy: member.userId,
      })
      .returning({ id: helpCenters.id });

    if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await tx
      .insert(publicKeys)
      .values({ key: publicKey, orgOf: member.orgId, kind: HELP_CENTER_KEY, targetId: row.id });

    return withTarget(await centerById(tx, row.id));
  });

const update = writes(PERMISSIONS.helpCenterManage)
  .input(createUpdateSchema(helpCenters, refine).pick(FIELDS).extend({ id: z.string() }))
  .output(HelpCenter)
  .handler(async ({ input: { id, ...fields }, context: { tx } }) => {
    await centerById(tx, id);
    await assertTopic(tx, fields.kbTopicId);
    await assertMessenger(tx, fields.messengerId);
    await tx
      .update(helpCenters)
      .set({ ...fields, formIds: await pickedForms(tx, fields.formIds) })
      .where(eq(helpCenters.id, id));

    return withTarget(await centerById(tx, id));
  });

/** Deletes the help centers, their domains on Cloudflare and their public addresses. */
const remove = writes(PERMISSIONS.helpCenterManage)
  .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx, member, afterCommit } }) => {
    const rows = await tx
      .select(centerColumns)
      .from(helpCenters)
      .where(inArray(helpCenters.id, input.ids));

    const ids = rows.map((row) => row.id);

    if (ids.length > 0) {
      await removeKeys(
        tx,
        member.orgId,
        and(
          inArray(publicKeys.kind, [HELP_CENTER_KEY, HELP_CENTER_DOMAIN]),
          inArray(publicKeys.targetId, ids),
        ),
      );
      await tx.delete(helpCenters).where(inArray(helpCenters.id, ids));
    }

    for (const row of rows) afterCommit(() => dropHostname(row));

    return { ids };
  });

/** Connects a domain, or checks the one connected again. */
const saveDomain = writesWithCore(
  PERMISSIONS.helpCenterManage,
  z.object({ id: z.string(), hostname: z.string().max(300) }),
  (member, input) => connectDomain(member.orgId, input.id, input.hostname),
)
  .output(HelpCenter)
  .handler(async ({ context: { tx, member, fromCore } }) => {
    await recordDomain(tx, member.orgId, fromCore, { restart: true });

    return withTarget(await centerById(tx, fromCore.id));
  });

const refreshDomain = writesWithCore(
  PERMISSIONS.helpCenterManage,
  z.object({ id: z.string() }),
  (member, input) => recheckDomain(member.orgId, input.id),
)
  .output(HelpCenter)
  .handler(async ({ context: { tx, member, fromCore } }) => {
    await recordDomain(tx, member.orgId, fromCore, { restart: true });

    return withTarget(await centerById(tx, fromCore.id));
  });

const removeDomain = writes(PERMISSIONS.helpCenterManage)
  .input(z.object({ id: z.string() }))
  .output(HelpCenter)
  .handler(async ({ input, context: { tx, member, afterCommit } }) => {
    const center = await centerById(tx, input.id);

    await clearDomain(tx, member.orgId, center);
    afterCommit(() => dropHostname(center));

    return withTarget(await centerById(tx, input.id));
  });

export const helpCenterProcedures = {
  list,
  get,
  create,
  update,
  remove,
  domain: { save: saveDomain, refresh: refreshDomain, reset: removeDomain },
};
