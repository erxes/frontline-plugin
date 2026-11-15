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
  HelpCenterStyles,
  helpCenters,
  publicAddresses,
} from '#/db/helpcenter.ts';
import { kbTopics } from '#/db/schema.ts';
import { reads, writes } from '#/orpc.ts';
import { Blank, Color, Title } from '../fields.ts';
import { FilterInput, type FilterFields, filterSql, likeText } from '../filter.ts';
import {
  cnameTarget,
  connectDomain,
  domainsAvailable,
  resetDomain,
  syncDomain,
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
});

const withTarget = <T extends { publicKey: string }>(row: T) => ({
  ...row,
  cnameTarget: cnameTarget(row.publicKey),
  domainsAvailable: domainsAvailable(),
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

/** Every help center, by title, narrowed by the filter bar. */
const list = reads(PERMISSIONS.helpCenterView)
  .input(z.object(FilterInput))
  .output(z.array(HelpCenter))
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

    return rows.map(withTarget);
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
      .insert(publicAddresses)
      .values({ address: publicKey, organizationId: member.orgId, helpCenterId: row.id });

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
  .handler(async ({ input, context: { tx } }) => {
    const rows = await tx
      .select(centerColumns)
      .from(helpCenters)
      .where(inArray(helpCenters.id, input.ids));

    await Promise.all(rows.map((row) => resetDomain(tx, row)));

    const ids = rows.map((row) => row.id);

    if (ids.length > 0) {
      await tx.delete(publicAddresses).where(inArray(publicAddresses.helpCenterId, ids));
      await tx.delete(helpCenters).where(inArray(helpCenters.id, ids));
    }

    return { ids };
  });

/** Connects a domain, or checks the one connected again. */
const saveDomain = writes(PERMISSIONS.helpCenterManage)
  .input(z.object({ id: z.string(), hostname: z.string().max(300) }))
  .output(HelpCenter)
  .handler(async ({ input, context: { tx, member } }) => {
    await connectDomain(tx, member.orgId, await centerById(tx, input.id), input.hostname);

    return withTarget(await centerById(tx, input.id));
  });

const refreshDomain = writes(PERMISSIONS.helpCenterManage)
  .input(z.object({ id: z.string() }))
  .output(HelpCenter)
  .handler(async ({ input, context: { tx } }) => {
    await syncDomain(tx, await centerById(tx, input.id), { restart: true });

    return withTarget(await centerById(tx, input.id));
  });

const removeDomain = writes(PERMISSIONS.helpCenterManage)
  .input(z.object({ id: z.string() }))
  .output(HelpCenter)
  .handler(async ({ input, context: { tx } }) => {
    await resetDomain(tx, await centerById(tx, input.id));

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
