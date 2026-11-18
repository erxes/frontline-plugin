import { randomUUID } from 'node:crypto';
import type { PluginJobDelivery } from '@erxes/core-contract';
import { DiscordAPIError, REST } from '@discordjs/rest';
import { WebSocketManager, WebSocketShardEvents } from '@discordjs/ws';
import {
  GatewayCloseCodes,
  GatewayDispatchEvents,
  type GatewayDispatchPayload,
  GatewayIntentBits,
} from 'discord-api-types/v10';
import { and, eq, or, sql } from 'drizzle-orm';
import { withOrg } from '#/db/client.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { logger } from '#/logger.ts';
import { recordCheck } from '../accounts.ts';
import { deliverInbound } from '../inbound.ts';
import type { AccountRow } from '../provider.ts';
import { discord } from './discord.ts';
import { catchUp, inboundOf } from './discordInbound.ts';

/** Discord's intents are bit flags, so their union is a number the enum type doesn't name. */
const isIntents = (value: number): value is GatewayIntentBits => Number.isInteger(value);

const INTENT_BITS = GatewayIntentBits.GuildMessages | GatewayIntentBits.DirectMessages;

/**
 * Server messages and direct messages. Without the privileged message content intent Discord
 * still sends the text of a direct message and of a message that mentions the bot, which are the
 * ones the inbox takes.
 */
const INTENTS = isIntents(INTENT_BITS) ? INTENT_BITS : 0;

const REFUSED_TOKEN = 'Discord refused the bot token: connect the bot again';

/** Closes Discord won't come back from: the bot has to be connected again, or the code fixed. */
const FATAL: Partial<Record<number, string>> = {
  [GatewayCloseCodes.AuthenticationFailed]: REFUSED_TOKEN,
  [GatewayCloseCodes.InvalidIntents]: 'Discord refused the intents frontline asked for',
  [GatewayCloseCodes.DisallowedIntents]: 'Discord refused the intents frontline asked for',
  [GatewayCloseCodes.InvalidAPIVersion]: 'Discord no longer takes this gateway version',
  [GatewayCloseCodes.ShardingRequired]: 'The bot is in too many servers for one gateway',
};

/** This replica, as the holder its leases name. */
const REPLICA = randomUUID();

/** How often this replica renews its leases, and how long one lasts without a renewal. */
const RENEW_MS = 60_000;
const LEASE = sql`interval '3 minutes'`;

/** The bots this replica keeps a gateway open for, by account id, with their latest row. */
const held = new Map<string, { row: AccountRow; manager: WebSocketManager }>();

/** The bots this replica is opening a gateway for. */
const opening = new Set<string>();

const gateway = sql`${integrationAccounts.syncState}->'gateway'`;

/**
 * Takes or renews the bot's lease for this replica, in its sync state, unless another replica
 * holds one that hasn't run out. Resolves to whether this replica holds it now.
 */
const lease = async (row: AccountRow) => {
  const taken = await withOrg(row.orgId, (tx) =>
    tx
      .update(integrationAccounts)
      .set({
        syncState: sql`${integrationAccounts.syncState} || jsonb_build_object('gateway', jsonb_build_object('holder', ${REPLICA}::text, 'until', now() + ${LEASE}))`,
      })
      .where(
        and(
          eq(integrationAccounts.id, row.id),
          or(
            sql`${gateway} is null`,
            sql`${gateway}->>'holder' = ${REPLICA}`,
            sql`(${gateway}->>'until')::timestamptz < now()`,
          ),
        ),
      )
      .returning({ id: integrationAccounts.id }),
  );

  return taken.length > 0;
};

/** Closes the bot's gateway and gives its lease back, unless another replica took it since. */
const letGo = async (row: AccountRow) => {
  const open = held.get(row.id);

  held.delete(row.id);
  await open?.manager.destroy();
  await withOrg(row.orgId, (tx) =>
    tx
      .update(integrationAccounts)
      .set({ syncState: sql`${integrationAccounts.syncState} - 'gateway'` })
      .where(and(eq(integrationAccounts.id, row.id), sql`${gateway}->>'holder' = ${REPLICA}`)),
  );
};

/** Closes the bot's gateway for good and marks the account broken with why. */
const refused = async (row: AccountRow, why: string) => {
  logger.warn({ accountId: row.id, why }, 'Discord refused the bot');
  await letGo(row);
  await recordCheck(row, why);
};

/** Renews this replica's leases; a bot whose lease it lost, or that was removed, is let go. */
const renew = async () => {
  await Promise.all(
    [...held.values()].map(async ({ row }) => {
      if (!(await lease(row))) await letGo(row);
    }),
  ).catch((error: unknown) => {
    logger.error({ err: error }, 'Discord leases not renewed');
  });
};

let renewing: NodeJS.Timeout | null = null;

/** What a gateway sent, if it is still the bot's: a message for the bot goes to the inbox. */
const received = async (manager: WebSocketManager, payload: GatewayDispatchPayload) => {
  const open = [...held.values()].find((entry) => entry.manager === manager);

  if (!open) return;

  if (payload.t === GatewayDispatchEvents.Ready)
    await catchUp(open.row, discord.open(open.row).account.secret.token);

  if (payload.t !== GatewayDispatchEvents.MessageCreate) return;

  const message = inboundOf(open.row.externalId, payload.d);

  if (message) await deliverInbound(open.row, [message]);
};

/** A close Discord won't come back from, on the bot's current gateway, marks it broken. */
const closed = async (manager: WebSocketManager, code: number) => {
  const open = [...held.values()].find((entry) => entry.manager === manager);
  const why = FATAL[code];

  if (open && why) await refused(open.row, why);
};

/** Opens the bot's gateway on this replica once it holds the bot's lease. */
const openGateway = async (row: AccountRow) => {
  if (!(await lease(row))) return;

  const { token } = discord.open(row).account.secret;

  const manager = new WebSocketManager({
    token,
    intents: INTENTS,
    rest: new REST().setToken(token),
  });

  held.set(row.id, { row, manager });
  renewing ??= setInterval(() => void renew(), RENEW_MS).unref();

  manager.on(WebSocketShardEvents.Dispatch, (payload) => {
    received(manager, payload).catch((error: unknown) => {
      logger.error({ err: error, accountId: row.id }, 'Discord message not delivered');
    });
  });

  manager.on(WebSocketShardEvents.Closed, (code) => {
    closed(manager, code).catch((error: unknown) => {
      logger.error({ err: error, accountId: row.id }, 'Discord gateway not let go');
    });
  });

  // The library reports a close it won't come back from here too; without a listener the
  // emit would throw and take the process down.
  manager.on(WebSocketShardEvents.Error, (error) => {
    logger.warn({ err: error, accountId: row.id }, 'Discord gateway failed');
  });

  await manager.connect().catch(async (error: unknown) => {
    // Discord asks for the token before the socket opens; a refused one won't pass next minute.
    if (error instanceof DiscordAPIError && error.status === 401)
      return refused(row, REFUSED_TOKEN);

    await letGo(row);
    throw error;
  });
};

/** Opens the bot's gateway here unless this replica has it open or is opening it. */
const hold = async (row: AccountRow) => {
  if (held.has(row.id) || opening.has(row.id)) return;

  opening.add(row.id);

  try {
    await openGateway(row);
  } finally {
    opening.delete(row.id);
  }
};

/**
 * Brings this replica's gateway for the bot up to date with its row: a bot that broke or was
 * connected again with another token is let go, and the rest carry the new row.
 */
const refresh = async (row: AccountRow) => {
  const open = held.get(row.id);

  if (!open) return;

  if (row.status === 'healthy' && row.secret === open.row.secret)
    held.set(row.id, { ...open, row });
  else await letGo(open.row);
};

/**
 * Opens a gateway for each of the organisation's healthy Discord bots whose lease no replica
 * holds, and closes the ones this replica holds for bots that were removed, broke or got a new
 * token. A broken bot opens again once a repair or a new connect marks it healthy. The replica
 * that holds a lease renews it itself, since core may run this job on any replica.
 */
export const keepDiscordGateways = async (job: PluginJobDelivery) => {
  const rows = await withOrg(job.orgId, (tx) =>
    tx.select().from(integrationAccounts).where(eq(integrationAccounts.provider, 'discord')),
  );

  const ids = new Set(rows.map(({ id }) => id));

  await Promise.all([
    ...[...held.values()]
      .filter(({ row }) => row.orgId === job.orgId && !ids.has(row.id))
      .map(({ row }) => letGo(row)),
    ...rows.map(refresh),
  ]);

  await Promise.all(
    rows
      .filter((row) => row.status === 'healthy')
      .map((row) =>
        hold(row).catch((error: unknown) => {
          logger.error({ err: error, accountId: row.id }, 'Discord gateway did not open');
        }),
      ),
  );
};

/** Closes every gateway this replica holds and gives their leases back, when it stops. */
export const stopDiscordGateways = async () => {
  if (renewing) clearInterval(renewing);

  renewing = null;
  await Promise.all([...held.values()].map(({ row }) => letGo(row)));
};
