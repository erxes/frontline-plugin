import type { DeliveredEvent } from '@erxes/plugin-sdk';
import { and, eq, getTableName, inArray, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { calls } from '#/db/calls.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { formSubmissions } from '#/db/forms.ts';
import type { CONTACT_KINDS } from '#/db/inbox.ts';
import {
  conversations,
  contactMerges,
  customerLinks,
  messageReactions,
  messages,
} from '#/db/inbox.ts';
import { visitors } from '#/db/messenger.ts';
import { kbArticleReactions } from '#/db/schema.ts';
import { surveyVotes } from '#/db/surveys.ts';
import { tickets } from '#/db/tickets.ts';
import { notifyVisitors } from '../inbox/shared.ts';

/**
 * Core merges duplicate customers or companies into one and deletes the others. Frontline's rows
 * that named a merged one name the kept one from then on: its conversations, the provider ids it
 * writes from (a Facebook sender, a Telegram chat, a messenger visitor), its tickets and calls. So
 * the next message from any of them lands in the kept customer's inbox. A row written while the
 * merge applies follows it too: the `frontline_follow_merge` trigger (migration 0045).
 */

export const MERGE_EVENTS = ['core.customer.merged', 'core.company.merged'] as const;

const MergeEvent = z.enum(MERGE_EVENTS);

const Merged = z.object({ mergedIds: z.array(z.string()).min(1) });

type Kind = (typeof CONTACT_KINDS)[number];

const ids = (values: string[]) => sql`${sql.param(values)}::text[]`;

/**
 * Rows unique per customer and `key`: where the kept customer, or a newer merged row, already
 * has one, the merged row goes, and the rest move over.
 */
const moveUnique = async (
  tx: Tx,
  table: PgTable,
  column: string,
  key: string[],
  keepId: string,
  mergedIds: string[],
) => {
  const name = sql.identifier(getTableName(table));
  const col = sql.identifier(column);

  const same = sql.join(
    key.map(
      (part) => sql`b.${sql.identifier(part)} is not distinct from a.${sql.identifier(part)}`,
    ),
    sql` and `,
  );

  await tx.execute(sql`
    delete from ${name} a using ${name} b
    where a.${col} = any(${ids(mergedIds)})
      and (b.${col} = ${keepId}
        or (b.${col} = any(${ids(mergedIds)}) and (b.created_at, b.${col}) > (a.created_at, a.${col})))
      and ${same}
  `);
  await tx.execute(
    sql`update ${name} set ${col} = ${keepId} where ${col} = any(${ids(mergedIds)})`,
  );
};

/** One messenger visitor row for the kept customer: the latest visit, every session counted. */
const mergeVisitors = async (tx: Tx, orgId: string, keepId: string, mergedIds: string[]) => {
  const rows = await tx
    .select()
    .from(visitors)
    .where(inArray(visitors.customerId, [keepId, ...mergedIds]));

  const latest = rows.toSorted((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())[0];

  if (!latest) return;

  await tx.delete(visitors).where(inArray(visitors.customerId, [keepId, ...mergedIds]));
  await tx.insert(visitors).values({
    ...latest,
    orgId,
    customerId: keepId,
    isOnline: rows.some((row) => row.isOnline),
    sessionCount: rows.reduce((sum, row) => sum + row.sessionCount, 0),
  });
};

/**
 * Waits for writes naming `mergedIds` to finish and holds new ones (the trigger's shared lock)
 * until this transaction commits. In one order, so two merges at once can't deadlock.
 */
const hold = (tx: Tx, orgId: string, kind: Kind, mergedIds: string[]) =>
  tx.execute(sql`
    select pg_advisory_xact_lock(hashtextextended(${orgId} || ':' || ${kind} || ':' || id, 0))
    from unnest(${ids(mergedIds.toSorted())}) as id order by id
  `);

/** Where `id` went: the kept one it was merged into, or itself. Kept ones are never merged ids. */
const keptOf = async (tx: Tx, kind: Kind, id: string) => {
  const [merged] = await tx
    .select({ keptId: contactMerges.keptId })
    .from(contactMerges)
    .where(and(eq(contactMerges.kind, kind), eq(contactMerges.mergedId, id)));

  return merged?.keptId ?? id;
};

/**
 * Records that `mergedIds` are `keepId` now, and so is every id merged into them before. Each
 * row names the latest kept one, so one read answers.
 */
const remember = async (tx: Tx, orgId: string, kind: Kind, keepId: string, mergedIds: string[]) => {
  await tx
    .update(contactMerges)
    .set({ keptId: keepId })
    .where(and(eq(contactMerges.kind, kind), inArray(contactMerges.keptId, mergedIds)));
  await tx
    .insert(contactMerges)
    .values(mergedIds.map((mergedId) => ({ orgId, kind, mergedId, keptId: keepId })))
    .onConflictDoUpdate({
      target: [contactMerges.orgId, contactMerges.kind, contactMerges.mergedId],
      set: { keptId: keepId },
    });
};

/** Points every frontline row of `mergedIds` at `keepId`. */
const mergeCustomers = async (tx: Tx, orgId: string, keepId: string, mergedIds: string[]) => {
  const to = { customerId: keepId };

  await tx.update(conversations).set(to).where(inArray(conversations.customerId, mergedIds));
  await tx.update(messages).set(to).where(inArray(messages.customerId, mergedIds));
  await tx.update(customerLinks).set(to).where(inArray(customerLinks.customerId, mergedIds));
  await tx.update(tickets).set(to).where(inArray(tickets.customerId, mergedIds));
  await tx.update(calls).set(to).where(inArray(calls.customerId, mergedIds));
  await tx.update(formSubmissions).set(to).where(inArray(formSubmissions.customerId, mergedIds));
  await moveUnique(tx, messageReactions, 'customer_id', ['message_id', 'emoji'], keepId, mergedIds);
  await moveUnique(tx, kbArticleReactions, 'customer_id', ['article_id'], keepId, mergedIds);
  await moveUnique(tx, surveyVotes, 'voter_id', ['message_id'], keepId, mergedIds);
  await tx
    .update(surveyVotes)
    .set({ customerId: keepId })
    .where(inArray(surveyVotes.customerId, mergedIds));
  await mergeVisitors(tx, orgId, keepId, mergedIds);
  // Their open messengers close their streams and open them again as the kept customer.
  await notifyVisitors(
    tx,
    orgId,
    mergedIds.map((customerId) => ({ id: keepId, customerId })),
    'merged',
  );
};

/** The customer `customerId` is now: the one it was merged into, or itself. */
export const currentCustomer = (orgId: string, customerId: string) =>
  withOrg(orgId, (tx) => keptOf(tx, 'customer', customerId));

/**
 * Applies a delivered `core.customer.merged` or `core.company.merged`; others do nothing. A
 * merge delivered late, after its kept one was merged on, moves the rows to the latest kept one.
 */
export const applyMerge = async (event: DeliveredEvent) => {
  const { type, subjectId, payload } = event.data;
  const parsed = MergeEvent.safeParse(type);

  if (!subjectId || !parsed.success) return 0;

  const kind: Kind = parsed.data === 'core.customer.merged' ? 'customer' : 'company';
  const orgId = event.organizationId;

  return withOrg(orgId, async (tx) => {
    const keepId = await keptOf(tx, kind, subjectId);
    const mergedIds = Merged.parse(payload).mergedIds.filter((id) => id !== keepId);

    if (!mergedIds.length) return 0;

    await hold(tx, orgId, kind, mergedIds);
    await remember(tx, orgId, kind, keepId, mergedIds);

    if (kind === 'customer') {
      await mergeCustomers(tx, orgId, keepId, mergedIds);
    } else {
      await tx
        .update(tickets)
        .set({ companyId: keepId })
        .where(inArray(tickets.companyId, mergedIds));
    }

    return mergedIds.length;
  });
};
