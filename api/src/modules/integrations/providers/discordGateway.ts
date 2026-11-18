import { randomUUID } from 'node:crypto';
import type { PluginJobDelivery } from '@erxes/core-contract';
import { REST } from '@discordjs/rest';
import { WebSocketManager, WebSocketShardEvents } from '@discordjs/ws';
import {
  GatewayCloseCodes,
  GatewayDispatchEvents,
  type GatewayDispatchPayload,
  GatewayIntentBits,
  type GatewayMessageCreateDispatchData,
} from 'discord-api-types/v10';
import { and, eq, or, sql } from 'drizzle-orm';
import { config } from '#/config.ts';
import { withOrg } from '#/db/client.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { logger } from '#/logger.ts';
import { FileRefused } from '#/modules/files.ts';
import { recordCheck } from '../accounts.ts';
import { deliverInbound } from '../inbound.ts';
import type { AccountRow, InboundMessage } from '../provider.ts';
import { discord } from './discord.ts';

/** Discord's intents are bit flags, so their union is a number the enum type doesn't name. */
const isIntents = (value: number): value is GatewayIntentBits => Number.isInteger(value);

const INTENT_BITS = GatewayIntentBits.GuildMessages | GatewayIntentBits.DirectMessages;

/**
 * Server messages and direct messages. Without the privileged message content intent Discord
 * still sends the text of a direct message and of a message that mentions the bot, which are the
 * ones the inbox takes.
 */
const INTENTS = isIntents(INTENT_BITS) ? INTENT_BITS : 0;

/** Closes Discord won't come back from: the bot has to be connected again, or the code fixed. */
const FATAL: Partial<Record<number, string>> = {
  [GatewayCloseCodes.AuthenticationFailed]: 'Discord refused the bot token: connect the bot again',
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

/** The bots this replica keeps a gateway open for, by account id. */
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

/** An attachment's bytes from Discord's CDN. */
const download = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(4 * config.outboundMs) });

  if (!response.ok)
    throw new (response.status < 500 ? FileRefused : Error)(
      `Discord did not send the file: ${response.status}`,
    );

  return new Uint8Array(await response.arrayBuffer());
};

/**
 * A message for the bot as the inbox reads it: a direct message, or one in a server that
 * mentions the bot or answers it, with the mention taken out. A conversation is one channel or
 * thread; none from a bot or a webhook.
 */
const inboundOf = (
  botId: string,
  message: GatewayMessageCreateDispatchData,
): InboundMessage | null => {
  const forBot =
    !message.guild_id ||
    message.mentions.some((user) => user.id === botId) ||
    message.referenced_message?.author.id === botId;

  if (!forBot || message.author.bot || message.webhook_id) return null;

  return {
    threadId: message.channel_id,
    messageId: message.id,
    author: {
      externalId: message.author.id,
      name: message.author.global_name ?? message.author.username,
    },
    text: message.content.replaceAll(new RegExp(`<@!?${botId}>`, 'g'), '').trim(),
    attachments: [],
    files: message.attachments.map((file) => ({
      name: file.filename,
      contentType: file.content_type ?? 'application/octet-stream',
      bytes: () => download(file.url),
    })),
  };
};

/** What the bot's gateway sent: a message for it goes to the inbox. */
const received = async (accountId: string, payload: GatewayDispatchPayload) => {
  const open = held.get(accountId);

  if (!open || payload.t !== GatewayDispatchEvents.MessageCreate) return;

  const message = inboundOf(open.row.externalId, payload.d);

  if (message) await deliverInbound(open.row, [message]);
};

/** A close Discord won't come back from marks the account broken and gives the lease up. */
const closed = async (row: AccountRow, code: number) => {
  const why = FATAL[code];

  if (!why) return;

  logger.warn({ accountId: row.id, code }, 'Discord closed the gateway for good');
  await letGo(row);
  await recordCheck(row, why);
};

/** Opens the bot's gateway on this replica once it holds the bot's lease. */
const open = async (row: AccountRow) => {
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
    received(row.id, payload).catch((error: unknown) => {
      logger.error({ err: error, accountId: row.id }, 'Discord message not delivered');
    });
  });

  manager.on(WebSocketShardEvents.Closed, (code) => {
    closed(row, code).catch((error: unknown) => {
      logger.error({ err: error, accountId: row.id }, 'Discord gateway not let go');
    });
  });

  await manager.connect().catch(async (error: unknown) => {
    await letGo(row);
    throw error;
  });
};

/** Opens the bot's gateway here unless this replica has it open or is opening it. */
const hold = async (row: AccountRow) => {
  if (held.has(row.id) || opening.has(row.id)) return;

  opening.add(row.id);

  try {
    await open(row);
  } finally {
    opening.delete(row.id);
  }
};

/**
 * Opens a gateway for each of the organisation's Discord bots whose lease no replica holds, and
 * closes the ones this replica holds for bots that were removed. The replica that holds a lease
 * renews it itself, since core may run this job on any replica.
 */
export const keepDiscordGateways = async (job: PluginJobDelivery) => {
  const rows = await withOrg(job.orgId, (tx) =>
    tx.select().from(integrationAccounts).where(eq(integrationAccounts.provider, 'discord')),
  );

  const ids = new Set(rows.map(({ id }) => id));

  await Promise.all(
    [...held.values()]
      .filter(({ row }) => row.orgId === job.orgId && !ids.has(row.id))
      .map(({ row }) => letGo(row)),
  );

  await Promise.all(
    rows.map((row) =>
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
