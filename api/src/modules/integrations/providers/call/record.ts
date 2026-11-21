import { enqueueJob } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { PLUGIN } from '#/config.ts';
import { core, JOBS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { type CALL_STATUSES, callLegs, callOperators, calls } from '#/db/calls.ts';
import { customerLinks, integrations } from '#/db/inbox.ts';
import type { Adapter } from '../../../inbox/adapters.ts';
import { receive } from '../../../inbox/receive.ts';
import type { AccountRow } from '../../provider.ts';
import { Cdr, extensionsOf, isAnsweredLeg, pbxTime, recordingOf, statusOf } from './cdr.ts';

type CallStatus = (typeof CALL_STATUSES)[number];

/** Callers by number: the same number on any line is the same customer. */
const PHONE_SOURCE = 'phone';

const linkedCustomer = (orgId: string, phone: string) =>
  withOrg(orgId, async (tx) => {
    const [link] = await tx
      .select({ customerId: customerLinks.customerId })
      .from(customerLinks)
      .where(and(eq(customerLinks.source, PHONE_SOURCE), eq(customerLinks.externalId, phone)));

    return link?.customerId;
  });

/**
 * The core customer with this phone number: the linked one, else core's customer with that
 * primary phone or a new lead, then its link. Calls core outside any transaction.
 */
const customerByPhone = async (orgId: string, phone: string) => {
  const linked = await linkedCustomer(orgId, phone);

  if (linked) return linked;

  const { customer } = await core.forOrg(orgId).customers.findOrCreate({
    primaryPhone: phone,
    firstName: phone,
    state: 'lead',
    source: 'call',
  });

  await withOrg(orgId, (tx) =>
    tx
      .insert(customerLinks)
      .values({ orgId, source: PHONE_SOURCE, externalId: phone, customerId: customer.id })
      .onConflictDoNothing(),
  );

  return (await linkedCustomer(orgId, phone)) ?? customer.id;
};

/** A phone integration names its account and the queues whose calls come to its channel. */
const CallIntegrationConfig = z.object({
  accountId: z.string().min(1),
  queues: z.array(z.string()).default([]),
});

/** The inbox's adapters for phone integrations. A call takes no written reply, so none sends. */
export const CALL_ADAPTERS: Adapter[] = [
  {
    kind: 'call',
    label: 'Phone (Grandstream PBX)',
    config: CallIntegrationConfig,
    notesOnly: true,
  },
  { kind: 'callpro', label: 'CallPro', config: CallIntegrationConfig, notesOnly: true },
];

/**
 * The active integration a call through `row` goes to: the one whose queues include the call's
 * queue, else the account's first.
 */
const integrationFor = async (tx: Tx, row: AccountRow, queue: string | null) => {
  const found = await tx
    .select({ id: integrations.id, config: integrations.config })
    .from(integrations)
    .where(
      and(
        eq(integrations.kind, row.provider),
        sql`${integrations.config} ->> 'accountId' = ${row.id}`,
        eq(integrations.isActive, true),
      ),
    )
    .orderBy(asc(integrations.createdAt), asc(integrations.id));

  const byQueue = found.find(
    (integration) =>
      queue && CallIntegrationConfig.safeParse(integration.config).data?.queues.includes(queue),
  );

  return (byQueue ?? found[0])?.id;
};

/** What frontline knows of a call when it first hears of it. */
export type NewCall = Pick<
  typeof calls.$inferSelect,
  'callKey' | 'direction' | 'customerPhone' | 'number' | 'queue' | 'startedAt'
>;

const callByKey = async (tx: Tx, accountId: string, callKey: string) => {
  const [found] = await tx
    .select()
    .from(calls)
    .where(and(eq(calls.accountId, accountId), eq(calls.callKey, callKey)))
    .for('update');

  return found;
};

/**
 * The call's id, opened first when it is new: its customer is found by number, and it starts
 * its own conversation in the inbox. Returns null for an account no channel uses, which keeps
 * nothing.
 */
const openCall = async (row: AccountRow, init: NewCall) => {
  const existing = await withOrg(row.orgId, (tx) => callByKey(tx, row.id, init.callKey));

  if (existing) return existing.id;

  const integrationId = await withOrg(row.orgId, (tx) => integrationFor(tx, row, init.queue));

  if (!integrationId) return null;

  const customerId = await customerByPhone(row.orgId, init.customerPhone);

  const message = await receive(row.orgId, {
    integrationId,
    customerId,
    externalConversationId: init.callKey,
    externalId: init.callKey,
    content:
      init.direction === 'incoming'
        ? `Incoming call from ${init.customerPhone}`
        : `Outgoing call to ${init.customerPhone}`,
    outgoing: init.direction !== 'incoming',
  });

  return withOrg(row.orgId, async (tx) => {
    await tx
      .insert(calls)
      .values({
        orgId: row.orgId,
        accountId: row.id,
        conversationId: message.conversationId,
        customerId,
        ...init,
      })
      .onConflictDoNothing();

    const opened = await callByKey(tx, row.id, init.callKey);

    if (!opened) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await signalCalls(tx, row.orgId);

    return opened.id;
  });
};

/** Tells members' open call lists and queues to refetch. */
export const signalCalls = (tx: Tx, orgId: string) =>
  tx.execute(sql`select core_live_signal(${orgId}, ${PLUGIN}, 'calls')`);

/** The member behind the first of `extensions` that is an operator's on the account. */
const operatorOf = async (tx: Tx, accountId: string, extensions: string[]) => {
  const found = await tx
    .select({ userId: callOperators.userId, extension: callOperators.extension })
    .from(callOperators)
    .where(eq(callOperators.accountId, accountId));

  return extensions
    .map((extension) => found.find((operator) => operator.extension === extension))
    .find((operator) => operator !== undefined);
};

/** Changes an open call in its own transaction, and tells members' lists when it changed. */
export const updateCall = (
  row: AccountRow,
  callId: string,
  change: (tx: Tx, call: typeof calls.$inferSelect) => Promise<Partial<typeof calls.$inferInsert>>,
) =>
  withOrg(row.orgId, async (tx) => {
    const [call] = await tx.select().from(calls).where(eq(calls.id, callId)).for('update');

    if (!call) throw new ORPCError('NOT_FOUND', { message: 'No such call' });

    const changed = await change(tx, call);

    if (Object.keys(changed).length === 0) return;

    await tx.update(calls).set(changed).where(eq(calls.id, callId));
    await signalCalls(tx, row.orgId);
  });

/** Queues the job that copies a call's recording from the PBX to core's storage. */
export const queueRecording = (tx: Tx, orgId: string, callId: string) =>
  enqueueJob(tx, {
    orgId,
    name: JOBS.recording.name,
    payload: { callId },
    dedupeKey: `recording:${callId}`,
  });

/**
 * Adds one CDR leg to its call, opening the call when it is the first word of it. The call's
 * status, operator, times and recording are read again from all its legs, so legs may come in
 * any order and a repeated one adds nothing.
 */
export const recordCdr = async (row: AccountRow, cdr: Cdr, init: NewCall, timeZone: string) => {
  const callId = await openCall(row, init);

  if (!callId) return;

  await updateCall(row, callId, async (tx, call) => {
    await tx
      .insert(callLegs)
      .values({ orgId: row.orgId, callId, legId: cdr.AcctId, cdr })
      .onConflictDoNothing();

    const legs = (
      await tx.select({ cdr: callLegs.cdr }).from(callLegs).where(eq(callLegs.callId, callId))
    )
      .map((leg) => Cdr.safeParse(leg.cdr).data)
      .filter((leg) => leg !== undefined);

    const answered = legs.find(isAnsweredLeg);
    const operator = answered && (await operatorOf(tx, row.id, extensionsOf(answered)));

    const ends = legs
      .map((leg) => pbxTime(leg.end, timeZone)?.getTime())
      .filter((end) => end !== undefined);

    const recordingFile = call.recording ? null : recordingOf(legs);

    if (recordingFile) await queueRecording(tx, row.orgId, callId);

    return {
      status: statusOf(legs),
      queue: call.queue ?? init.queue,
      extension: operator?.extension ?? answered?.dstanswer ?? call.extension,
      answeredBy: operator?.userId ?? call.answeredBy,
      answeredAt: answered ? pbxTime(answered.answer, timeZone) : call.answeredAt,
      endedAt: ends.length ? new Date(Math.max(...ends)) : call.endedAt,
      durationSec: answered?.billsec ?? null,
      recordingFile: recordingFile ?? call.recordingFile,
    };
  });
};

const isLive = (status: CallStatus) => status === 'ringing' || status === 'active';

/**
 * Opens the call, then settles it with `status` when one is given, as a line without CDRs
 * reports it.
 */
export const recordStatus = async (
  row: AccountRow,
  init: NewCall,
  status: CallStatus | undefined,
) => {
  const callId = await openCall(row, init);

  if (!callId || !status) return;

  await updateCall(row, callId, async (_tx, call) => ({
    status,
    answeredAt: status === 'answered' ? (call.answeredAt ?? new Date()) : call.answeredAt,
    endedAt: call.endedAt ?? new Date(),
  }));
};

/** A live event from the PBX's bridge: a call rings, is answered, or ends. */
export const CallEvent = z.object({
  type: z.enum(['ringing', 'answered', 'bridged', 'noanswer', 'hangup']),
  uniqueid: z.string().min(1),
  linkedid: z.string().optional(),
  callType: z.enum(['incoming', 'outgoing']).optional(),
  callerIdNum: z.string().optional(),
  calleeIdNum: z.string().optional(),
  srcTrunkName: z.string().optional(),
  dstTrunkName: z.string().optional(),
  queueName: z.string().optional(),
  extension: z.string().optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
});

export type CallEvent = z.infer<typeof CallEvent>;

/**
 * Moves a call through what its live events say: ringing opens it, an answer makes it active
 * with its operator, and a hangup ends it. Its CDRs settle how it ended.
 */
export const recordEvent = async (
  row: AccountRow,
  event: CallEvent,
  init: NewCall,
  timeZone: string,
) => {
  const callId = await openCall(row, init);

  if (!callId) return;

  await updateCall(row, callId, async (tx, call) => {
    // A CDR settled the call already: live events that come late change nothing.
    if (!isLive(call.status)) return {};

    if (event.type === 'answered' || event.type === 'bridged') {
      const operator = await operatorOf(tx, row.id, event.extension ? [event.extension] : []);

      return {
        status: 'active',
        extension: event.extension ?? call.extension,
        answeredBy: operator?.userId ?? call.answeredBy,
        answeredAt: call.answeredAt ?? new Date(),
      };
    }

    if (event.type === 'hangup')
      return {
        status: call.status === 'ringing' ? 'missed' : 'answered',
        endedAt: (event.endedAt && pbxTime(event.endedAt, timeZone)) || new Date(),
      };

    return {};
  });
};
