// Phone calls: the PBX's operators and queues, then one `frontline_calls` row per call from the
// old call histories (older PBX bridge) and sessions (CTI bridge), with each CDR as a leg. A call
// lives in its own inbox conversation, so one whose conversation isn't imported stays out.
import type { Document } from 'mongodb';
import type { Context } from '../context.ts';
import { put, skip } from '../engine.ts';
import type { Step } from '../step.ts';
import {
  createdOf,
  dateOf,
  entriesOf,
  idOf,
  intOf,
  numberOf,
  plain,
  textOf,
  docId,
} from '../values.ts';

/** Members and their extensions on each PBX, from the old integration's `operators`. */
const operatorStep: Step = {
  source: 'erxes.calls_integrations.operators',
  documents: async (ctx) =>
    (await ctx.find(ctx.main, 'calls_integrations').toArray()).flatMap((doc) =>
      (Array.isArray(doc.operators) ? doc.operators : []).map((operator: unknown) => ({
        _id: `${String(idOf(doc.inboxId))}:${String(idOf(entriesOf(operator).get('gsUsername')))}`,
        inboxId: idOf(doc.inboxId),
        operator,
      })),
    ),
  transform: (doc, ctx) => {
    const operator = entriesOf(doc.operator);
    const accountId = ctx.known('account', idOf(doc.inboxId));
    const userId = ctx.user(idOf(operator.get('userId')));
    const extension = textOf(operator.get('gsUsername'));

    if (!accountId) return skip('its PBX is not imported');

    if (!userId || !extension) return skip('no member or extension');

    // The SIP password stays out, as every secret does: the member enters it again.
    return put([
      'frontline_call_operators',
      { id: `${accountId}:${extension}`, account_id: accountId, user_id: userId, extension },
    ]);
  },
};

/** Queue counters as the PBX last reported them, then the queues each integration followed. */
const queueStatisticStep: Step = {
  source: 'erxes.calls_queue_statistics',
  documents: (ctx) => ctx.find(ctx.main, 'calls_queue_statistics'),
  transform: (doc, ctx) => {
    const accountId = ctx.known('account', idOf(doc.integrationId));
    const queue = textOf(doc.queue);

    if (!accountId) return skip('its PBX is not imported');

    if (!queue) return skip('no queue number');

    return put([
      'frontline_call_queues',
      {
        id: `${accountId}:${queue}`,
        account_id: accountId,
        queue,
        total_calls: Math.max(intOf(doc.totalCalls) ?? 0, 0),
        answered_calls: Math.max(intOf(doc.answeredCalls) ?? 0, 0),
        abandoned_calls: Math.max(intOf(doc.abandonedCalls) ?? 0, 0),
        transferred_calls: Math.max(intOf(doc.transferOutCalls) ?? 0, 0),
        avg_wait: numberOf(doc.avgWait) ?? 0,
        avg_talk: numberOf(doc.avgTalk) ?? 0,
        sla_rate: numberOf(doc.slaRate) ?? 0,
        stats_at: dateOf(doc.updatedAt),
      },
    ]);
  },
};

const integrationQueueStep: Step = {
  source: 'erxes.calls_integrations.queues',
  documents: async (ctx) =>
    (await ctx.find(ctx.main, 'calls_integrations').toArray()).flatMap((doc) =>
      (Array.isArray(doc.queues) ? doc.queues : []).map((queue: unknown) => ({
        _id: `${String(idOf(doc.inboxId))}:${String(textOf(queue))}`,
        inboxId: idOf(doc.inboxId),
        queue,
      })),
    ),
  transform: (doc, ctx) => {
    const accountId = ctx.known('account', idOf(doc.inboxId));
    const queue = textOf(doc.queue);

    if (!accountId) return skip('its PBX is not imported');

    if (!queue) return skip('no queue number');

    return put([
      'frontline_call_queues',
      { id: `${accountId}:${queue}`, account_id: accountId, queue },
    ]);
  },
};

const DIRECTIONS: Record<string, 'incoming' | 'outgoing'> = {
  incoming: 'incoming',
  'callDirection/INCOMING': 'incoming',
  outgoing: 'outgoing',
  'callDirection/OUTGOING': 'outgoing',
};

/** The call's account, conversation and customer, or why it has none. */
const placeOf = (ctx: Context, doc: Document) => {
  const conversationId = idOf(doc.conversationId);
  const conversation = conversationId ? ctx.conversations.get(conversationId) : undefined;

  const accountId = ctx.known(
    'account',
    idOf(doc.inboxIntegrationId) ?? conversation?.inboxId ?? null,
  );

  const customerId = ctx.customer(idOf(doc.customerId)) ?? conversation?.customerId;

  if (!conversationId) return 'it names no conversation, which a call needs';

  if (!conversation) return 'its conversation is not imported';

  if (!accountId) return 'its PBX is not imported';

  if (!customerId) return 'no customer';

  return { conversationId, accountId, customerId };
};

/** How an old history's call ended; an `active` one the PBX never closed ended answered if it lasted. */
const historyStatusOf = (doc: Document) => {
  switch (doc.callStatus) {
    case 'connected':
    case 'transferred':
    case 'transfered':
    case 'cancelledToAnswered':
      return 'answered';
    case 'missed':
    case 'cancelled':
      return 'missed';
    // A call the bridge never closed, or one it saved no status for.
    case 'active':
    case undefined:
      return (intOf(doc.callDuration) ?? 0) > 0 ? 'answered' : 'missed';
    default:
      return null;
  }
};

const callRow = (
  ctx: Context,
  id: string,
  place: Exclude<ReturnType<typeof placeOf>, string>,
  row: Record<string, unknown>,
) => {
  // A CDR names its conversation; one in a conversation of several calls goes to the first.
  if (!ctx.known('call.conversation', place.conversationId))
    ctx.remember('call.conversation', place.conversationId, id);

  return put([
    'frontline_calls',
    {
      id,
      account_id: place.accountId,
      conversation_id: place.conversationId,
      customer_id: place.customerId,
      ...row,
    },
  ]);
};

const historyStep: Step = {
  source: 'erxes.calls_histories',
  documents: (ctx) => ctx.find(ctx.main, 'calls_histories'),
  transform: (doc, ctx) => {
    const id = String(docId(doc));
    const direction = DIRECTIONS[String(doc.callType)];
    const status = historyStatusOf(doc);
    const incoming = direction === 'incoming';

    const customerPhone =
      textOf(doc.customerPhone) ?? textOf(incoming ? doc.callerNumber : doc.receiverNumber);

    const startedAt = createdOf(doc, doc.callStartTime, doc.createdAt);
    const place = placeOf(ctx, doc);

    if (!direction) return skip(`unknown call type ${String(doc.callType)}`);

    if (!status) return skip(`unknown call status ${String(doc.callStatus)}`);

    if (!customerPhone) return skip('no phone number');

    if (typeof place === 'string') return skip(place);

    return callRow(ctx, id, place, {
      call_key: textOf(doc.timeStamp) ?? textOf(doc.sessionId) ?? id,
      direction,
      status,
      customer_phone: customerPhone,
      number:
        textOf(doc.operatorPhone) ?? textOf(incoming ? doc.receiverNumber : doc.callerNumber) ?? '',
      queue: textOf(doc.queueName),
      extension: textOf(doc.extentionNumber) ?? textOf(doc.extensionNumber),
      answered_by: status === 'answered' ? ctx.user(idOf(doc.createdBy)) : null,
      started_at: startedAt,
      answered_at: status === 'answered' ? dateOf(doc.callStartTime) : null,
      ended_at: dateOf(doc.callEndTime),
      duration_sec: intOf(doc.callDuration),
      recording_file: textOf(doc.recordUrl),
      created_at: createdOf(doc, doc.createdAt),
      updated_at: createdOf(doc, doc.modifiedAt, doc.updatedAt, doc.createdAt),
    });
  },
};

/** The CTI bridge's hangup causes as statuses; a session still ringing never connected. */
const HANGUPS: Record<string, string> = {
  ANSWERED: 'answered',
  'NO ANSWER': 'missed',
  BUSY: 'busy',
  FAILED: 'failed',
};

const sessionStep: Step = {
  source: 'erxes.calls_sessions',
  documents: (ctx) => ctx.find(ctx.main, 'calls_sessions'),
  transform: (doc, ctx) => {
    const id = String(docId(doc));
    const direction = DIRECTIONS[String(doc.callType)];

    const status = doc.hangupCause
      ? HANGUPS[String(doc.hangupCause)]
      : doc.status === 'ringing'
        ? 'missed'
        : undefined;

    const raw = entriesOf(plain(doc.raw));
    const customerPhone = textOf(doc.customerPhone);

    const answered = (Array.isArray(doc.ringingOperators) ? doc.ringingOperators : [])
      .map((operator: unknown) => entriesOf(operator))
      .find((operator: Map<string, unknown>) => operator.get('state') === 'answered');

    const place = placeOf(ctx, doc);

    if (!direction) return skip(`unknown call type ${String(doc.callType)}`);

    if (!status) return skip(`unknown hangup cause ${String(doc.hangupCause)}`);

    if (!customerPhone) return skip('no phone number');

    if (typeof place === 'string') return skip(place);

    const cdrId = textOf(doc.cdrAcctId);

    if (cdrId) ctx.remember('call.cdr', cdrId, id);

    return callRow(ctx, id, place, {
      call_key: textOf(doc.linkedid) ?? textOf(doc.uniqueid) ?? id,
      direction,
      status,
      customer_phone: customerPhone,
      number: textOf(doc.operatorPhone) ?? '',
      queue: textOf(raw.get('queue')),
      extension: textOf(raw.get('extension')),
      answered_by: answered ? ctx.user(idOf(answered.get('userId'))) : null,
      started_at: createdOf(doc, doc.startedAt, doc.createdAt),
      ended_at: dateOf(doc.endedAt),
      duration_sec: intOf(doc.durationSec),
      created_at: createdOf(doc, doc.createdAt),
      updated_at: createdOf(doc, doc.updatedAt, doc.createdAt),
    });
  },
};

/** Each CDR the PBX sent, as a leg of the session that named it, else of its conversation's call. */
const cdrStep: Step = {
  source: 'erxes.calls_cdrs',
  documents: (ctx) => ctx.find(ctx.main, 'calls_cdrs'),
  transform: (doc, ctx) => {
    const callId =
      ctx.known('call.cdr', textOf(doc.acctId)) ??
      ctx.known('call.conversation', idOf(doc.conversationId));

    const cdr = Object.fromEntries(
      Object.entries(doc).filter(([key]) => key !== '_id' && key !== '__v'),
    );

    if (!callId) return skip('its call is not imported');

    return put([
      'frontline_call_legs',
      {
        id: String(docId(doc)),
        call_id: callId,
        leg_id: textOf(doc.acctId) ?? String(docId(doc)),
        cdr: plain(cdr),
        created_at: createdOf(doc, doc.createdAt),
      },
    ]);
  },
};

const CALLPRO_STATUSES: Record<string, string> = {
  ANSWERED: 'answered',
  'NO ANSWER': 'missed',
  MISSED: 'missed',
  BUSY: 'busy',
};

const callproStep: Step = {
  source: 'erxes.conversations_callpros',
  documents: (ctx) => ctx.find(ctx.main, 'conversations_callpros'),
  transform: (doc, ctx) => {
    const id = String(docId(doc));
    const status = CALLPRO_STATUSES[String(doc.state)];
    const customerPhone = textOf(doc.senderPhoneNumber);
    const startedAt = createdOf(doc, doc.createdAt);

    const place = placeOf(ctx, {
      conversationId: idOf(doc.erxesApiId),
      inboxIntegrationId: idOf(doc.integrationId),
    });

    if (!status) return skip(`unknown state ${String(doc.state)}`);

    if (!customerPhone) return skip('no phone number');

    if (!startedAt) return skip('no start time');

    if (typeof place === 'string') return skip(place);

    return callRow(ctx, id, place, {
      call_key: textOf(doc.callId) ?? id,
      direction: 'incoming',
      status,
      customer_phone: customerPhone,
      number: textOf(doc.recipientPhoneNumber) ?? '',
      started_at: startedAt,
    });
  },
};

export const CALL_STEPS: Step[] = [
  operatorStep,
  queueStatisticStep,
  integrationQueueStep,
  historyStep,
  sessionStep,
  callproStep,
  cdrStep,
];
