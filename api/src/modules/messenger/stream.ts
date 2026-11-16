import { Client } from 'pg';
import { z } from 'zod';
import { config } from '#/config.ts';
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

const drop = (error?: Error) => {
  if (error) logger.error({ err: error }, 'visitor stream connection failed');
  connection = null;
};

const deliver = (payload: string | undefined) => {
  const notice = Notice.safeParse(JSON.parse(payload ?? 'null'));

  if (!notice.success) return;

  const { orgId, customerId, conversationId, event } = notice.data;

  for (const listener of listeners.get(keyOf(orgId, customerId)) ?? [])
    listener({ conversationId, event });
};

/**
 * One connection LISTENing on the visitors' channel for the whole process. A dropped one is
 * reopened by the next stream that subscribes.
 */
const connect = () => {
  connection ??= (async () => {
    const client = new Client({ connectionString: config.dataUrl, application_name: 'frontline' });

    client.on('error', drop);
    client.on('end', () => drop());
    client.on('notification', ({ payload }) => deliver(payload));

    await client.connect();
    await client.query(`LISTEN ${VISITOR_CHANNEL}`);

    return client;
  })().catch((error: unknown) => {
    connection = null;
    throw error;
  });

  return connection;
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
