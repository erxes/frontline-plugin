import { enqueueJob } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { RouteBases, Routes } from 'discord-api-types/v10';
import { z } from 'zod';
import { JOBS, PERMISSIONS } from '#/core.ts';
import { writesWithCore } from '#/orpc.ts';
import { attachedFile } from '#/modules/files.ts';
import { AccountRefused, defineProvider } from '../provider.ts';
import { providerApi } from '../providerApi.ts';
import { Account, Into, intoChannel, saveAccount } from '../store.ts';

const Secret = z.object({ token: z.string() });

const User = z.object({ id: z.string(), username: z.string() });

const Application = z.object({ id: z.string() });

const Sent = z.object({ id: z.string(), channel_id: z.string() });

const Failure = z.object({ message: z.string() });

const restApi = providerApi({
  name: 'Discord',
  prefix: RouteBases.api,
  readError: (body, status) => ({
    why: Failure.safeParse(body).data?.message,
    deadToken: status === 401,
  }),
});

/**
 * One Discord REST call as the bot. Resolves to the parsed body, null for 204 No Content, or
 * fails with Discord's message.
 */
export const rest = (
  token: string,
  route: `/${string}`,
  { method = 'GET', body }: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {},
) =>
  restApi(route, {
    method,
    headers: { authorization: `Bot ${token}` },
    ...(body instanceof FormData ? { body } : body ? { json: body } : {}),
  }).json();

const why = (error: unknown) => (error instanceof Error ? error.message : 'Discord failed');

const botOf = async (token: string) => User.parse(await rest(token, Routes.user('@me')));

/** A Discord bot: a conversation is one channel or thread it was added to. */
export const discord = defineProvider({
  name: 'discord',
  Config: z.object({}),
  Secret,
  check: async ({ secret }) => botOf(secret.token).then(() => null, why),
  // The text and every file go as one message. Discord refuses more than it takes, and then the
  // reply fails rather than goes without them. A quoted message that is gone sends the reply on
  // its own.
  send: async ({ row, secret }, message) => {
    const files = await Promise.all(
      message.attachments.map((file) => attachedFile(row.orgId, file)),
    );

    const body = new FormData();

    body.set(
      'payload_json',
      JSON.stringify({
        content: message.text,
        attachments: files.map((file, id) => ({ id, filename: file.name })),
        ...(message.quotedId && {
          message_reference: { message_id: message.quotedId, fail_if_not_exists: false },
        }),
      }),
    );
    files.forEach((file, id) => body.set(`files[${id}]`, file));

    const sent = Sent.parse(
      await rest(secret.token, Routes.channelMessages(message.threadId), { method: 'POST', body }),
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

/**
 * Connects a bot by its token from Discord's developer portal, once Discord accepts it, with its
 * application's id, which the link that adds the bot to a server names. Discord is asked before
 * the transaction opens.
 */
const connect = writesWithCore(
  PERMISSIONS.integrationManage,
  z.object({ token: z.string().trim().min(20).max(200), ...Into }),
  (_member, input) =>
    Promise.all([
      botOf(input.token),
      rest(input.token, Routes.currentApplication()).then((answer) => Application.parse(answer)),
    ]).catch((error: unknown) => {
      throw new ORPCError('BAD_REQUEST', {
        message:
          error instanceof AccountRefused ? `Discord refused the token: ${why(error)}` : why(error),
      });
    }),
)
  .route({ summary: "Connect a Discord bot by its token from Discord's developer portal" })
  .output(Account)
  .handler(
    async ({
      input,
      context: {
        tx,
        member,
        fromCore: [bot, application],
      },
    }) => {
      const account = await saveAccount(
        tx,
        member,
        {
          provider: 'discord',
          externalId: bot.id,
          name: bot.username,
          config: { applicationId: application.id },
          secret: { token: input.token },
        },
        await intoChannel(tx, member, input.channelId),
      );

      // Its gateway opens now rather than on the next minute's run.
      await enqueueJob(tx, { orgId: member.orgId, name: JOBS.discordGateway.name, payload: {} });

      return account;
    },
  );

export const discordProcedures = { connect };
