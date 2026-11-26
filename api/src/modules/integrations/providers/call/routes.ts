import { createHmac } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { type Tx, withOrg } from '#/db/client.ts';
import { callQueues } from '#/db/calls.ts';
import { logger } from '#/logger.ts';
import type { AccountRow } from '../../provider.ts';
import { sameText } from '../../secrets.ts';
import { accountOf } from '../../store.ts';
import { call, callpro } from './call.ts';
import { followAgents, pausedAtOf } from './lines.ts';
import { trunkKey } from './relay.ts';
import { Cdr, callKeyOf, customerPhoneOf, isOutgoing, pbxTime, queueOf } from './cdr.ts';
import type { CALL_STATUSES } from '#/db/calls.ts';
import {
  CallEvent,
  type NewCall,
  recordCdr,
  recordEvent,
  recordStatus,
  signalCalls,
} from './record.ts';

type CallStatus = (typeof CALL_STATUSES)[number];

/** How far a signed post's timestamp may be from now. */
const SIGNATURE_WINDOW_MS = 5 * 60 * 1000;

/** Whether pbx-relay signed `raw` with the account's secret within the last five minutes. */
const signedBy = (secret: string, req: Request, raw: string) => {
  const timestamp = Number(req.headers['x-erxes-timestamp']);

  if (!Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > SIGNATURE_WINDOW_MS)
    return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');

  return sameText(expected, req.headers['x-erxes-signature']);
};

/** The UCM's own new-call payload, as pbx-relay forwards it: a ringing event. */
const UcmCall = z.object({
  type: z.enum(['incoming_call', 'outgoing_call']),
  caller: z.string(),
  extension: z.string().optional(),
  did: z.string().optional(),
  queue: z.string().optional(),
  uniqueid: z.string().min(1),
  linkedid: z.string().optional(),
  at: z.string().optional(),
});

const ucmEvent = (posted: z.infer<typeof UcmCall>): CallEvent => {
  const incoming = posted.type === 'incoming_call';

  return {
    type: 'ringing',
    uniqueid: posted.uniqueid,
    linkedid: posted.linkedid,
    callType: incoming ? 'incoming' : 'outgoing',
    callerIdNum: incoming ? posted.caller : posted.extension,
    calleeIdNum: incoming ? posted.did : posted.caller,
    queueName: posted.queue,
    extension: posted.extension,
    startedAt: posted.at,
  };
};

/** A queue's counters as the UCM reports them, in snake or camel case. */
const QueueStat = z
  .object({
    queue: z.coerce.string(),
    total_calls: z.coerce.number().optional(),
    totalCalls: z.coerce.number().optional(),
    answered_calls: z.coerce.number().optional(),
    answeredCalls: z.coerce.number().optional(),
    abandoned_calls: z.coerce.number().optional(),
    abandonedCalls: z.coerce.number().optional(),
    transfer_out_calls: z.coerce.number().optional(),
    transferOutCalls: z.coerce.number().optional(),
    avg_wait: z.coerce.number().optional(),
    avgWait: z.coerce.number().optional(),
    avg_talk: z.coerce.number().optional(),
    avgTalk: z.coerce.number().optional(),
    sla_rate: z.coerce.number().optional(),
    slaRate: z.coerce.number().optional(),
  })
  .transform((stat) => ({
    queue: stat.queue,
    totalCalls: stat.total_calls ?? stat.totalCalls ?? 0,
    answeredCalls: stat.answered_calls ?? stat.answeredCalls ?? 0,
    abandonedCalls: stat.abandoned_calls ?? stat.abandonedCalls ?? 0,
    transferredCalls: stat.transfer_out_calls ?? stat.transferOutCalls ?? 0,
    avgWait: stat.avg_wait ?? stat.avgWait ?? 0,
    avgTalk: stat.avg_talk ?? stat.avgTalk ?? 0,
    slaRate: stat.sla_rate ?? stat.slaRate ?? 0,
  }));

const QueueStats = z
  .union([
    z.object({ root_statistics: z.object({ queue: z.array(QueueStat) }) }),
    z.object({ queue: z.array(QueueStat) }),
    z.array(QueueStat),
  ])
  .transform((posted) =>
    Array.isArray(posted)
      ? posted
      : 'root_statistics' in posted
        ? posted.root_statistics.queue
        : posted.queue,
  );

/** A queue's live board as pbx-relay posts it. */
const QueueLive = z.object({
  queue: z.coerce.string(),
  state: z.object({
    agents: z
      .array(
        z.object({
          member_extension: z.coerce.string(),
          first_name: z.string().default(''),
          last_name: z.string().default(''),
          status: z.string().default(''),
          answer: z.coerce.number().default(0),
          abandon: z.coerce.number().default(0),
          talktime: z.coerce.number().default(0),
          pausetime: z.string().nullish(),
        }),
      )
      .default([]),
    waiting: z
      .array(z.object({ callerid: z.coerce.string(), callerchannel: z.string().nullish() }))
      .default([]),
    talking: z
      .array(
        z.object({
          callerid: z.coerce.string(),
          calleeid: z.coerce.string().nullish(),
          bridge_time: z.string().nullish(),
        }),
      )
      .default([]),
  }),
});

/** Changes one of the account's queues; only the queues an admin added are kept. */
const setQueue = (
  tx: Tx,
  row: AccountRow,
  queue: string,
  change: Partial<typeof callQueues.$inferInsert>,
) =>
  tx
    .update(callQueues)
    .set(change)
    .where(and(eq(callQueues.accountId, row.id), eq(callQueues.queue, queue)));

/** The kinds of post pbx-relay makes for a PBX, the last part of its webhook's address. */
const PbxKind = z.enum(['cdr', 'event', 'receive-call', 'queue-stats', 'queue-live']);

/** What one kind of post does with a PBX account's body. */
const PBX_POSTS: Record<
  z.infer<typeof PbxKind>,
  (row: AccountRow, body: unknown) => Promise<void>
> = {
  cdr: async (row, body) => {
    const { config } = call.open(row).account;
    const cdr = Cdr.parse(body);

    await recordCdr(
      row,
      cdr,
      {
        callKey: callKeyOf(cdr),
        direction: isOutgoing(cdr) ? 'outgoing' : 'incoming',
        customerPhone: customerPhoneOf(cdr),
        number: config.phone,
        queue: queueOf(cdr),
        startedAt: pbxTime(cdr.start, config.timeZone) ?? new Date(),
      },
      config.timeZone,
    );
  },
  event: (row, body) => onEvent(row, CallEvent.parse(body)),
  'receive-call': (row, body) => onEvent(row, ucmEvent(UcmCall.parse(body))),
  'queue-stats': async (row, body) => {
    const queues = QueueStats.parse(body);

    await withOrg(row.orgId, async (tx) => {
      await Promise.all(
        queues.map(({ queue, ...stats }) =>
          setQueue(tx, row, queue, { ...stats, statsAt: new Date() }),
        ),
      );

      await signalCalls(tx, row.orgId);
    });
  },
  'queue-live': async (row, body) => {
    const { queue, state } = QueueLive.parse(body);

    const live = {
      agents: state.agents.map((agent) => ({
        extension: agent.member_extension,
        name: [agent.first_name, agent.last_name].filter(Boolean).join(' '),
        status: agent.status,
        answered: agent.answer,
        abandoned: agent.abandon,
        talkSeconds: agent.talktime,
        pausedAt: pausedAtOf(agent.pausetime),
      })),
      waiting: state.waiting.map((caller) => ({
        callerId: caller.callerid,
        channel: caller.callerchannel ?? null,
      })),
      talking: state.talking.map((talk) => ({
        callerId: talk.callerid,
        calleeId: talk.calleeid ?? null,
        since: talk.bridge_time ?? null,
      })),
    };

    await withOrg(row.orgId, async (tx) => {
      await setQueue(tx, row, queue, { live, liveAt: new Date() });
      await followAgents(tx, row.id, live.agents);
      await signalCalls(tx, row.orgId);
    });
  },
};

/** Whether the event's trunk is the account's, compared by `trunkKey`; a blank trunk is none. */
const sameTrunk = (named: string | undefined, account: string) =>
  trunkKey(account) !== '' && trunkKey(named ?? '') === trunkKey(account);

/**
 * Whether a live event's call came in or went out: through the account's inbound trunk it came
 * in, on its outbound trunk it went out, as the old integration told them; else the event's own
 * type, else a call with only an outbound trunk went out.
 */
const directionOf = (
  event: CallEvent,
  { srcTrunk, dstTrunk }: { srcTrunk: string; dstTrunk: string },
) => {
  if (sameTrunk(event.srcTrunkName, srcTrunk)) return 'incoming';

  if (sameTrunk(event.dstTrunkName, dstTrunk)) return 'outgoing';

  return event.callType ?? (event.dstTrunkName && !event.srcTrunkName ? 'outgoing' : 'incoming');
};

const onEvent = async (row: AccountRow, event: CallEvent) => {
  const { config } = call.open(row).account;

  const direction = directionOf(event, config);

  const init: NewCall = {
    callKey: event.linkedid || event.uniqueid,
    direction,
    customerPhone: z
      .string()
      .min(1)
      .parse(direction === 'incoming' ? event.callerIdNum : event.calleeIdNum),
    number: config.phone,
    queue: event.queueName ?? null,
    startedAt: (event.startedAt && pbxTime(event.startedAt, config.timeZone)) || new Date(),
  };

  await recordEvent(row, event, init, config.timeZone);
};

/** What CallPro posts on each change of a call. */
const CallProEvent = z.object({
  callID: z.coerce.string().min(1),
  numberFrom: z.coerce.string().min(1),
  numberTo: z.coerce.string(),
  /** CallPro's disposition: `ANSWERED`, `NO ANSWER`, `BUSY`. */
  disp: z.string(),
});

/** How a CallPro disposition ends a call; any other leaves it ringing. */
const CALLPRO_STATUS: Record<string, CallStatus | undefined> = {
  ANSWERED: 'answered',
  'NO ANSWER': 'missed',
  BUSY: 'busy',
  FAILED: 'failed',
};

const onCallPro = async (row: AccountRow, body: unknown) => {
  const event = CallProEvent.parse(body);

  await recordStatus(
    row,
    {
      callKey: event.callID,
      direction: 'incoming',
      customerPhone: event.numberFrom,
      number: callpro.open(row).account.config.phone || event.numberTo,
      queue: null,
      startedAt: new Date(),
    },
    CALLPRO_STATUS[event.disp.toUpperCase()],
  );
};

/**
 * Reads a post as text so its signature can be checked, then answers with `run`'s status: 400
 * for a body that isn't the provider's shape, which won't be any better sent again.
 */
const handle =
  (
    provider: 'call' | 'callpro',
    run: (row: AccountRow, req: Request, raw: string) => Promise<number>,
  ) =>
  async (req: Request<{ key: string }>, res: Response) => {
    const raw = typeof req.body === 'string' ? req.body : '';
    const row = await accountOf({ provider, key: req.params.key });

    if (!row) {
      logger.info({ provider }, 'webhook for no connected account');
      res.sendStatus(404);

      return;
    }

    try {
      res.sendStatus(await run(row, req, raw));
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof z.ZodError) res.sendStatus(400);
      else throw error;
    }
  };

/**
 * The phone webhooks under `/api/public/webhooks`: pbx-relay, or a bridge run by hand, posts each
 * kind of a PBX's event to `call/<key>/<kind>`, signed; CallPro posts to `callpro/<key>`, where
 * the key is the secret.
 */
export const callWebhooks = () => {
  const router = express.Router();
  const text = express.text({ type: '*/*', limit: '2mb' });

  router.post(
    '/call/:key/:kind',
    text,
    handle('call', async (row, req, raw) => {
      const kind = PbxKind.safeParse(req.params.kind);

      if (!kind.success) return 404;

      if (!signedBy(call.open(row).account.secret.webhookSecret, req, raw)) return 401;

      await PBX_POSTS[kind.data](row, JSON.parse(raw));

      return 200;
    }),
  );

  router.post(
    '/callpro/:key',
    text,
    handle('callpro', async (row, _req, raw) => {
      await onCallPro(row, JSON.parse(raw));

      return 200;
    }),
  );

  return router;
};
