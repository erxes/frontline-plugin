import { ORPCError } from '@orpc/server';
import { RouteBases, Routes } from 'discord-api-types/v10';
import { z } from 'zod';
import { config } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import { writes } from '#/orpc.ts';
import { defineProvider } from '../provider.ts';
import { Account, saveAccount } from '../store.ts';

const Secret = z.object({ token: z.string() });

const User = z.object({ id: z.string(), username: z.string() });

const Sent = z.object({ id: z.string(), channel_id: z.string() });

const Failure = z.object({ message: z.string() });

/**
 * One Discord REST call as the bot. Resolves to the parsed body, null for 204 No Content, or
 * fails with Discord's message.
 */
const rest = async (
  token: string,
  route: `/${string}`,
  { method = 'GET', body }: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {},
) => {
  const response = await fetch(`${RouteBases.api}${route}`, {
    method,
    headers: {
      authorization: `Bot ${token}`,
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(config.outboundMs),
  });

  const answer: unknown = response.status === 204 ? null : await response.json();

  if (!response.ok)
    throw new Error(
      Failure.safeParse(answer).data?.message ?? `Discord answered ${response.status}`,
    );

  return answer;
};

const why = (error: unknown) => (error instanceof Error ? error.message : 'Discord failed');

const botOf = async (token: string) => User.parse(await rest(token, Routes.user('@me')));

/** A Discord bot: a conversation is one channel or thread it was added to. */
export const discord = defineProvider({
  name: 'discord',
  Config: z.object({}),
  Secret,
  check: async ({ secret }) => botOf(secret.token).then(() => null, why),
  send: async ({ secret }, message) => {
    const sent = Sent.parse(
      await rest(secret.token, Routes.channelMessages(message.threadId), {
        method: 'POST',
        body: { content: message.text },
      }),
    );

    return sent.id;
  },
  // Discord keeps several emoji on a message: the bot has one while any member does.
  react: async ({ secret }, { threadId, message, emoji, emojis }) => {
    await rest(
      secret.token,
      Routes.channelMessageOwnReaction(threadId, message.externalId, encodeURIComponent(emoji)),
      { method: emojis.includes(emoji) ? 'PUT' : 'DELETE' },
    );
  },
});

/** Connects a bot by its token from Discord's developer portal, once Discord accepts it. */
const connect = writes(PERMISSIONS.integrationManage)
  .input(z.object({ token: z.string().trim().min(20).max(200) }))
  .output(Account)
  .handler(async ({ input, context: { tx, member } }) => {
    const bot = await botOf(input.token).catch((error: unknown) => {
      throw new ORPCError('BAD_REQUEST', { message: `Discord refused the token: ${why(error)}` });
    });

    return saveAccount(tx, member, {
      provider: 'discord',
      externalId: bot.id,
      name: bot.username,
      config: {},
      secret: { token: input.token },
    });
  });

export const discordProcedures = { connect };
