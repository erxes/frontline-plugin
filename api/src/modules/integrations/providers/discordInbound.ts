import { MessageType, Routes } from 'discord-api-types/v10';
import { and, desc, eq, isNotNull, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '#/config.ts';
import { withOrg } from '#/db/client.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import { logger } from '#/logger.ts';
import { FileRefused } from '#/modules/files.ts';
import { deliverInbound } from '../inbound.ts';
import { type AccountRow, inOrder, type InboundMessage } from '../provider.ts';
import { rest } from './discord.ts';

/** The parts of a Discord message the inbox reads, from the gateway or from REST. */
const DiscordMessage = z.object({
  id: z.string(),
  channel_id: z.string(),
  guild_id: z.string().optional(),
  type: z.number(),
  author: z.object({
    id: z.string(),
    username: z.string(),
    global_name: z.string().nullish(),
    bot: z.boolean().optional(),
  }),
  content: z.string(),
  mentions: z.array(z.object({ id: z.string() })),
  attachments: z.array(
    z.object({ filename: z.string(), content_type: z.string().optional(), url: z.string() }),
  ),
  webhook_id: z.string().optional(),
});

/** The kinds of message a person writes; pins, joins, boosts and the like are left out. */
const WRITTEN = new Set<number>([MessageType.Default, MessageType.Reply]);

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
 * mentions the bot, with the mention taken out. Without the Message Content intent Discord sends
 * the text and files of those only, so a message with neither is left out, as is one from a bot
 * or a webhook. A conversation is one channel or thread.
 */
export const inboundOf = (
  botId: string,
  message: z.infer<typeof DiscordMessage>,
): InboundMessage | null => {
  const forBot = !message.guild_id || message.mentions.some((user) => user.id === botId);
  const text = message.content.replaceAll(new RegExp(`<@!?${botId}>`, 'g'), '').trim();

  if (!forBot || !WRITTEN.has(message.type) || message.author.bot || message.webhook_id)
    return null;

  if (!text && message.attachments.length === 0) return null;

  return {
    threadId: message.channel_id,
    messageId: message.id,
    author: {
      externalId: message.author.id,
      name: message.author.global_name ?? message.author.username,
    },
    text,
    attachments: [],
    files: message.attachments.map((file) => ({
      name: file.filename,
      contentType: file.content_type ?? 'application/octet-stream',
      bytes: () => download(file.url),
    })),
  };
};

/** How many of the bot's latest conversations a new gateway session catches up on. */
const CATCH_UP = 50;

/**
 * The channels of the bot's latest conversations, each with the newest Discord message the inbox
 * has there. Snowflakes are numbers in text, so they compare padded.
 */
const lastKept = (row: AccountRow) =>
  withOrg(row.orgId, (tx) =>
    tx
      .select({
        channelId: conversations.externalId,
        after: sql<string>`ltrim(max(lpad(${messages.externalId}, 20, '0')), '0')`,
      })
      .from(conversations)
      .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
      .innerJoin(messages, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(integrations.kind, 'discord'),
          sql`${integrations.config} ->> 'accountId' = ${row.id}`,
          isNotNull(conversations.externalId),
          isNotNull(messages.externalId),
        ),
      )
      .groupBy(conversations.externalId)
      .orderBy(desc(max(messages.createdAt)))
      .limit(CATCH_UP),
  );

/**
 * Brings in what customers wrote in the bot's latest conversations while no gateway was open,
 * one channel at a time, since a new session doesn't replay them. The inbox skips the ones it
 * has. A channel the bot can no longer read is left out.
 */
export const catchUp = async (row: AccountRow, token: string) => {
  const channels = await lastKept(row);

  await inOrder(channels, async ({ channelId, after }) => {
    if (!channelId) return;

    const answer = await rest(
      token,
      `${Routes.channelMessages(channelId)}?after=${after}&limit=100`,
    ).catch((error: unknown) => {
      logger.warn({ err: error, accountId: row.id, channelId }, 'Discord channel not caught up');

      return [];
    });

    const missed = z
      .array(DiscordMessage)
      .parse(answer)
      .toReversed()
      .flatMap((message) => inboundOf(row.externalId, message) ?? []);

    if (missed.length) await deliverInbound(row, missed);
  });
};
