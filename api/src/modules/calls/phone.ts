import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { and, desc, eq, inArray, isNotNull, or, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { callOperators, calls } from '#/db/calls.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { reads, writes } from '#/orpc.ts';
import { call, pbxOf } from '../integrations/providers/call/call.ts';
import { pbxAction } from '../integrations/providers/call/pbx.ts';
import { openSecret } from '../integrations/secrets.ts';

/**
 * The softphone core mounts on every page (`floatingWidget`): the member's SIP lines, the
 * extensions they can transfer to, and the call they are on, for its notes.
 */

const SipSecret = z.object({ password: z.string() });

/** The caller's extensions on connected PBXes that match `where`, with the PBX's account. */
const operatorLines = (tx: Tx, member: PluginMember, where: SQL) =>
  tx
    .select({ operator: callOperators, account: integrationAccounts })
    .from(callOperators)
    .innerJoin(integrationAccounts, eq(integrationAccounts.id, callOperators.accountId))
    .where(
      and(eq(callOperators.userId, member.userId), eq(integrationAccounts.provider, 'call'), where),
    )
    .orderBy(integrationAccounts.name);

const lineOf = async (tx: Tx, member: PluginMember, accountId: string) => {
  const [found] = await operatorLines(tx, member, eq(callOperators.accountId, accountId));

  if (!found) throw new ORPCError('NOT_FOUND', { message: 'You have no extension on this PBX' });

  return { extension: found.operator.extension, pbx: pbxOf(call.open(found.account).account) };
};

const pbxFailed = (error: unknown) => {
  throw new ORPCError('BAD_GATEWAY', {
    message: error instanceof Error ? error.message : 'The PBX did not answer',
  });
};

/**
 * The lines the caller's softphone signs in to: each extension with a SIP password, on the PBX's
 * WebRTC socket (`wss://<host>/ws`, the UCM's HTTPS port), relayed through the PBX's TURN server
 * when it has one.
 */
const lines = reads(PERMISSIONS.callView)
  .input(z.object({}))
  .output(
    z.array(
      z.object({
        accountId: z.string(),
        name: z.string(),
        extension: z.string(),
        password: z.string(),
        webSocketUrl: z.string(),
        iceServers: z.array(
          z.object({
            urls: z.string(),
            username: z.string().optional(),
            credential: z.string().optional(),
          }),
        ),
      }),
    ),
  )
  .handler(async ({ context: { tx, member } }) => {
    const rows = await operatorLines(tx, member, isNotNull(callOperators.sipSecret));

    return rows.flatMap(({ operator, account }) => {
      if (!operator.sipSecret) return [];

      const { config } = call.open(account).account;

      return {
        accountId: account.id,
        name: account.name,
        extension: operator.extension,
        password: openSecret(member.orgId, operator.sipSecret, SipSecret).password,
        webSocketUrl: `wss://${config.host}/ws`,
        iceServers: config.turnUrl
          ? [
              {
                urls: config.turnUrl,
                username: config.turnUsername || undefined,
                credential: config.turnPassword || undefined,
              },
            ]
          : [],
      };
    });
  });

const PbxAccounts = z.object({
  account: z
    .array(
      z.object({
        extension: z.coerce.string(),
        fullname: z.string().nullish(),
        status: z.string().nullish(),
      }),
    )
    .default([]),
});

/** The PBX's other extensions, the ones the caller can transfer a call to. */
const extensions = reads(PERMISSIONS.callView)
  .input(z.object({ accountId: z.string() }))
  .output(z.array(z.object({ extension: z.string(), name: z.string(), status: z.string() })))
  .handler(async ({ input, context: { tx, member } }) => {
    const line = await lineOf(tx, member, input.accountId);

    const { account } = await pbxAction(line.pbx, 'listAccount', PbxAccounts, {
      item_num: '500',
      options: 'extension,fullname,status',
      page: '1',
      sidx: 'extension',
      sord: 'asc',
    }).catch(pbxFailed);

    return account
      .filter((row) => row.extension !== line.extension)
      .map((row) => ({
        extension: row.extension,
        name: row.fullname ?? '',
        status: row.status ?? '',
      }));
  });

const Bridged = z.object({
  channel: z
    .array(
      z.object({
        callerid1: z.coerce.string().nullish(),
        callerid2: z.coerce.string().nullish(),
        channel1: z.string().nullish(),
        channel2: z.string().nullish(),
      }),
    )
    .default([]),
});

/** Hands the caller's call on to another extension: the PBX moves the caller's side of it. */
const transfer = writes(PERMISSIONS.callView)
  .input(z.object({ accountId: z.string(), extension: z.string().trim().min(1).max(30) }))
  .output(z.object({ extension: z.string() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const line = await lineOf(tx, member, input.accountId);

    const bridged = await pbxAction(line.pbx, 'listBridgedChannels', Bridged).catch(pbxFailed);

    const channel = bridged.channel
      .map((row) =>
        row.callerid1 === line.extension
          ? row.channel1
          : row.callerid2 === line.extension
            ? row.channel2
            : null,
      )
      .find(Boolean);

    if (!channel) throw new ORPCError('NOT_FOUND', { message: 'You are on no call to transfer' });

    await pbxAction(line.pbx, 'callTransfer', z.unknown(), {
      extension: input.extension,
      channel,
    }).catch(pbxFailed);

    return { extension: input.extension };
  });

/**
 * The caller's latest call that is ringing or on, by the member or their extension, with the
 * conversation its notes go to. Null until the PBX reports it.
 */
const current = reads(PERMISSIONS.callView)
  .input(z.object({ accountId: z.string() }))
  .output(
    z
      .object({
        id: z.string(),
        conversationId: z.string(),
        customerId: z.string(),
        customerPhone: z.string(),
      })
      .nullable(),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    const { extension } = await lineOf(tx, member, input.accountId);

    const [found] = await tx
      .select({
        id: calls.id,
        conversationId: calls.conversationId,
        customerId: calls.customerId,
        customerPhone: calls.customerPhone,
      })
      .from(calls)
      .where(
        and(
          eq(calls.accountId, input.accountId),
          inArray(calls.status, ['ringing', 'active']),
          or(eq(calls.answeredBy, member.userId), eq(calls.extension, extension)),
        ),
      )
      .orderBy(desc(calls.startedAt))
      .limit(1);

    return found ?? null;
  });

export const phoneProcedures = { lines, extensions, transfer, current };
