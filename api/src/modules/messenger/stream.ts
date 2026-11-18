import { Client } from 'pg';
import { z } from 'zod';
import { config, PLUGIN } from '#/config.ts';
import { logger } from '#/logger.ts';
import { VISITOR_CHANNEL, VISITOR_EVENTS } from '../inbox/shared.ts';

/** What `notifyVisitors` sends on the channel: what happened to which conversation of whose. */
const Notice = z.object({
  orgId: z.string(),
  conversationId: z.string(),
  customerId: z.string(),
  event: z.enum(VISITOR_EVENTS),
});

type Listener = (notice: {
  conversationId: string;
  event: (typeof VISITOR_EVENTS)[number];
}) => void;

/** The open visitor streams, by organisation and customer. */
const listeners = new Map<string, Set<Listener>>();

const keyOf = (orgId: string, customerId: string) => `${orgId}\u0000${customerId}`;

let connection: Promise<Client> | null = null;
let retry: NodeJS.Timeout | null = null;

const deliver = (payload: string | undefined) => {
  const notice = Notice.safeParse(JSON.parse(payload ?? 'null'));

  if (!notice.success) return;

  const { orgId, customerId, conversationId, event } = notice.data;

  for (const listener of listeners.get(keyOf(orgId, customerId)) ?? [])
    listener({ conversationId, event });
};

/** While any stream is open, opens the connection again in 2 s, and again until it holds. */
const reconnectSoon = () => {
  if (retry || listeners.size === 0) return;

  retry = setTimeout(() => {
    retry = null;
    // A failure drops the connection, which tries again.
    connect().catch(() => undefined);
  }, 2_000);

  retry.unref();
};

/**
 * One connection LISTENing on the visitors' channel for the whole process. A dropped one opens
 * again while streams are open, so they keep hearing about their conversations.
 */
const connect = () => {
  if (connection) return connection;

  const client = new Client({ connectionString: config.dataUrl, application_name: PLUGIN });

  const opened = (async () => {
    await client.connect();
    await client.query(`LISTEN ${VISITOR_CHANNEL}`);

    return client;
  })();

  const drop = (error?: unknown) => {
    // A late `end` from a connection already replaced leaves the new one alone.
    if (connection !== opened) return;

    logger.error({ err: error }, 'visitor stream connection dropped');
    connection = null;
    reconnectSoon();
  };

  client.on('error', drop);
  client.on('end', () => drop());
  client.on('notification', ({ payload }) => deliver(payload));

  connection = opened;
  opened.catch(drop);

  return opened;
};

/** Whether a messenger of the customer still streams from this process. */
export const streaming = (orgId: string, customerId: string) =>
  listeners.has(keyOf(orgId, customerId));

/** Calls `listener` with what happens to each conversation of the customer, until the returned stop. */
export const subscribe = async (orgId: string, customerId: string, listener: Listener) => {
  await connect();

  const key = keyOf(orgId, customerId);
  const set = listeners.get(key) ?? new Set();

  set.add(listener);
  listeners.set(key, set);

  return () => {
    set.delete(listener);

    if (set.size === 0) listeners.delete(key);
  };
};
