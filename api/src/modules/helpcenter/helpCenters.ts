import { randomBytes } from 'node:crypto';
import { ORPCError } from '@orpc/server';
import { and, asc, eq, getTableColumns, ilike, inArray } from 'drizzle-orm';
import { createInsertSchema, createSelectSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';
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
import { publicKeys } from '#/db/public.ts';
import { kbTopics } from '#/db/schema.ts';
import { reads, writes, writesWithCore } from '#/orpc.ts';
import { Blank, Color, Title } from '../fields.ts';
import { FilterInput, type FilterFields, filterSql, likeText } from '../filter.ts';
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

const { orgId, ...centerColumns } = getTableColumns(helpCenters);

const refine = {
  title: () => Title,
  description: () => Blank(2000),
  languageCode: () => z.string().max(10).nullable(),
  kbLabel: () => Blank(100),
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
});

const withTarget = <T extends { publicKey: string }>(row: T) => ({
  ...row,
  cnameTarget: cnameTarget(row.publicKey),
  domainsAvailable: domainsAvailable(),
  scriptUrl: widgetScript('knowledgebase', { key: row.publicKey }),
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

const CENTER_FILTER: FilterFields = {
  'subject.title': { kind: 'text', expr: helpCenters.title },
  'subject.kbTopicId': { kind: 'select', expr: helpCenters.kbTopicId },
  'subject.createdBy': { kind: 'member', expr: helpCenters.createdBy },
  'subject.createdAt': { kind: 'date', expr: helpCenters.createdAt },
};

/** Every help center, by title, narrowed by the filter bar, and whether the caller manages them. */
const list = reads(PERMISSIONS.helpCenterView)
  .input(z.object(FilterInput))
  .output(z.object({ helpCenters: z.array(HelpCenter), canManage: z.boolean() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const rows = await tx
      .select(centerColumns)
      .from(helpCenters)
      .where(
        and(
          input.search ? ilike(helpCenters.title, likeText(input.search)) : undefined,
          input.filter ? filterSql(CENTER_FILTER, input.filter, member.userId) : undefined,
        ),
      )
      .orderBy(asc(helpCenters.title));

    return {
      helpCenters: rows.map(withTarget),
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

    const publicKey = randomBytes(10).toString('hex');

    const [row] = await tx
      .insert(helpCenters)
      .values({ ...input, publicKey, orgId: member.orgId, createdBy: member.userId })
      .returning(centerColumns);

    if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await tx
      .insert(publicKeys)
      .values({ key: publicKey, orgOf: member.orgId, kind: HELP_CENTER_KEY, targetId: row.id });

    return withTarget(row);
  });

const update = writes(PERMISSIONS.helpCenterManage)
  .input(createUpdateSchema(helpCenters, refine).pick(FIELDS).extend({ id: z.string() }))
  .output(HelpCenter)
  .handler(async ({ input: { id, ...fields }, context: { tx } }) => {
    await centerById(tx, id);
    await assertTopic(tx, fields.kbTopicId);
    await tx.update(helpCenters).set(fields).where(eq(helpCenters.id, id));

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
