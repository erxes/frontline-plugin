import type { DeliveredEvent } from '@erxes/plugin-sdk';
import { eq, getTableName, inArray, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { calls } from '#/db/calls.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { formSubmissions } from '#/db/forms.ts';
import {
  conversations,
  customerLinks,
  customerMerges,
  messageReactions,
  messages,
} from '#/db/inbox.ts';
import { visitors } from '#/db/messenger.ts';
import { kbArticleReactions } from '#/db/schema.ts';
import { surveyVotes } from '#/db/surveys.ts';
import { tickets } from '#/db/tickets.ts';

/**
 * Core merges duplicate customers or companies into one and deletes the others. Frontline's rows
 * that named a merged one name the kept one from then on: its conversations, the provider ids it
 * writes from (a Facebook sender, a Telegram chat, a messenger visitor), its tickets and calls. So
 * the next message from any of them lands in the kept customer's inbox.
 */

export const MERGE_EVENTS = ['core.customer.merged', 'core.company.merged'] as const;

const Merged = z.object({ mergedIds: z.array(z.string()).min(1) });

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

/** Points every frontline row of `mergedIds` at `keepId`, and remembers where each went. */
export const mergeCustomers = async (
  tx: Tx,
  orgId: string,
  keepId: string,
  mergedIds: string[],
) => {
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

  // An id merged earlier into one of these now leads to the kept customer too.
  await tx
    .update(customerMerges)
    .set({ customerId: keepId })
    .where(inArray(customerMerges.customerId, mergedIds));
  await tx
    .insert(customerMerges)
    .values(mergedIds.map((mergedId) => ({ orgId, mergedId, customerId: keepId })))
    .onConflictDoUpdate({
      target: [customerMerges.orgId, customerMerges.mergedId],
      set: { customerId: keepId },
    });
};

/** The customer `customerId` is now: the one it was merged into, or itself. */
export const currentCustomer = async (orgId: string, customerId: string) => {
  const [merged] = await withOrg(orgId, (tx) =>
    tx
      .select({ customerId: customerMerges.customerId })
      .from(customerMerges)
      .where(eq(customerMerges.mergedId, customerId)),
  );

  return merged?.customerId ?? customerId;
};

/** Applies a delivered `core.customer.merged` or `core.company.merged`; others do nothing. */
export const applyMerge = async (event: DeliveredEvent) => {
  const { type, subjectId, payload } = event.data;

  if (!subjectId || !(MERGE_EVENTS as readonly string[]).includes(type)) return 0;

  const mergedIds = Merged.parse(payload).mergedIds.filter((id) => id !== subjectId);

  if (!mergedIds.length) return 0;

  await withOrg(event.organizationId, async (tx) => {
    if (type === 'core.customer.merged') {
      await mergeCustomers(tx, event.organizationId, subjectId, mergedIds);
    } else {
      await tx
        .update(tickets)
        .set({ companyId: subjectId })
        .where(inArray(tickets.companyId, mergedIds));
    }
  });

  return mergedIds.length;
};
