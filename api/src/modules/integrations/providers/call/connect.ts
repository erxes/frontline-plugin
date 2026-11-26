import { randomBytes, randomUUID } from 'node:crypto';
import { ORPCError } from '@orpc/server';
import { eq, getTableColumns, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import type { PluginMember } from '@erxes/plugin-sdk';
import { config } from '#/config.ts';
import { logger } from '#/logger.ts';
import { PERMISSIONS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { callOperators, callQueues } from '#/db/calls.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { isBlockedIp } from '#/modules/outbound.ts';
import { reads, writes, writesWithCore } from '#/orpc.ts';
import {
  Account,
  accountColumns,
  accountRow,
  Into,
  intoChannel,
  saveAccount,
  webhookKeyOf,
} from '../../store.ts';
import { call, callApi } from './call.ts';
import { Lines, saveLines } from './lines.ts';
import { checkPbx } from './pbx.ts';
import { takesCalls } from './record.ts';
import { callWebhookUrl, followedQueues, routeCalls, sameRoute, unrouteCalls } from './relay.ts';

const Host = z
  .string()
  .trim()
  .regex(/^[a-z0-9.-]+(:\d{1,5})?$/i, 'A host name, with a port if not 443')
  .refine((host) => !isBlockedIp(host.replace(/:\d+$/, '')), 'A public address, not a private one');

const TimeZone = z.string().refine((zone) => Intl.supportedValuesOf('timeZone').includes(zone), {
  message: 'An IANA time zone, such as Asia/Ulaanbaatar',
});

const Phone = z.string().trim().min(3).max(30);

/** A trunk's name on the PBX, as its CDRs and events name it. */
const Trunk = z.string().trim().max(100).default('');

const PbxInput = z.object({
  /** What the account is called in frontline; empty, its phone number. */
  name: z.string().trim().max(100).default(''),
  phone: Phone,
  /** The trunk calls come in through and the one they go out on, which tell a call's direction. */
  srcTrunk: Trunk,
  dstTrunk: Trunk,
  timeZone: TimeZone,
});

const newKey = () => randomBytes(24).toString('base64url');

/** pbx-relay refusing a route refuses the change, in the relay's words. */
const relayRefused = (error: unknown) => {
  throw new ORPCError('BAD_REQUEST', {
    message: error instanceof Error ? error.message : 'pbx-relay failed',
    cause: error,
  });
};

const ConnectInput = PbxInput.extend({
  host: Host,
  queues: Lines.queues.default([]),
  operators: Lines.operators.default([]),
  ...Into,
});

/** What connect sets up with the PBX and pbx-relay before it saves the account. */
type Routed = { id: string; webhookSecret: string; webhookKey: string };

/** Saves a connected PBX as an account in its channel, with its queues and operators. */
const saveConnected = async (
  tx: Tx,
  member: PluginMember,
  input: z.infer<typeof ConnectInput>,
  routed: Routed,
) => {
  const { channelId, name, queues, operators, ...settings } = input;

  const account = await saveAccount(
    tx,
    member,
    {
      id: routed.id,
      provider: 'call',
      // The account's own id: a PBX's accounts are told apart by their trunks and queues.
      externalId: routed.id,
      name: name || input.phone,
      config: settings,
      secret: { webhookSecret: routed.webhookSecret },
      webhookKey: routed.webhookKey,
    },
    await intoChannel(tx, member, channelId),
  );

  await saveLines(tx, member.orgId, account.id, { queues, operators });

  return account;
};

/**
 * Connects a Grandstream UCM: frontline signs in to it as the install's API user
 * (`CALL_API_USER`), then hands out the address and secret its events are signed with, and with
 * pbx-relay routes its trunks and queues here, all before the transaction opens, so a refusal
 * saves nothing. Its queues and operators can come with it, as the old form took them.
 * Each connect is a new account, so one PBX can have several, each with its own trunks and queues;
 * pbx-relay refuses a trunk or queue another account already routes.
 */
const connect = writesWithCore(
  PERMISSIONS.integrationManage,
  ConnectInput,
  async (member, input): Promise<Routed> => {
    const refused = await checkPbx({
      orgId: member.orgId,
      host: input.host,
      ...callApi(),
    });

    if (refused) throw new ORPCError('BAD_REQUEST', { message: refused });

    await withOrg(member.orgId, (tx) => intoChannel(tx, member, input.channelId));

    const pbx = {
      id: randomUUID(),
      host: input.host,
      srcTrunk: input.srcTrunk,
      dstTrunk: input.dstTrunk,
      webhookSecret: randomBytes(32).toString('hex'),
      webhookKey: newKey(),
    };

    await routeCalls(
      pbx,
      input.queues.map(({ queue }) => queue),
      pbx.webhookKey,
    ).catch(relayRefused);

    return pbx;
  },
)
  .route({
    summary:
      'Connect a Grandstream UCM phone system as a new account, routing its trunks and queues here',
  })
  .output(Account)
  .handler(({ input, context: { tx, member, fromCore } }) =>
    // The route is already up: an account that isn't saved takes it down again, or its trunks and
    // queues would stay held for an account that doesn't exist.
    saveConnected(tx, member, input, fromCore).catch(async (error: unknown) => {
      await unrouteCalls(fromCore.id).catch((cause: unknown) =>
        logger.error({ err: cause, accountId: fromCore.id }, 'pbx-relay kept an unsaved route'),
      );
      throw error;
    }),
  );

/** Connects a CallPro line by its number; CallPro posts its calls to the address frontline gives. */
const connectCallPro = writes(PERMISSIONS.integrationManage)
  .route({ summary: 'Connect a CallPro line by its phone number' })
  .input(z.object({ phone: Phone, ...Into }))
  .output(Account)
  .handler(async ({ input, context: { tx, member } }) =>
    saveAccount(
      tx,
      member,
      {
        provider: 'callpro',
        externalId: input.phone,
        name: input.phone,
        config: { phone: input.phone },
        secret: {},
        webhookKey: newKey(),
      },
      await intoChannel(tx, member, input.channelId),
    ),
  );

const Queue = createSelectSchema(callQueues).omit({ orgId: true, live: true });

const Operator = createSelectSchema(callOperators)
  .omit({ orgId: true, sipSecret: true })
  .extend({ hasSipPassword: z.boolean() });

const { orgId: _queueOrg, live: _live, ...queueColumns } = getTableColumns(callQueues);

const {
  orgId: _operatorOrg,
  sipSecret: _sipSecret,
  ...operatorColumns
} = getTableColumns(callOperators);

const phoneAccount = async (tx: Tx, id: string) => {
  const row = await accountRow(tx, id);

  if (row.provider !== 'call' && row.provider !== 'callpro')
    throw new ORPCError('NOT_FOUND', { message: 'No such phone account' });

  return row;
};

/**
 * A phone account's settings: its queues, its operators, and where its posts go. A PBX's events
 * are signed with `webhookSecret`, by pbx-relay when the install has one (`relayed`), else by a
 * bridge run by hand; a CallPro address is its own secret.
 */
const settings = reads(PERMISSIONS.integrationManage)
  .route({
    summary:
      "Get a phone account's settings: queues, operators, webhook address and secret, and whether calls reach a channel",
  })
  .input(z.object({ accountId: z.string() }))
  .output(
    z.object({
      account: Account,
      queues: z.array(Queue),
      operators: z.array(Operator),
      webhookUrl: z.string().nullable(),
      webhookSecret: z.string().nullable(),
      /** Whether an active integration takes its calls; without one they are dropped. */
      inChannel: z.boolean(),
      /** Whether pbx-relay routes the PBX's events here, so no bridge needs its address. */
      relayed: z.boolean(),
    }),
  )
  .handler(async ({ input, context: { tx } }) => {
    const row = await phoneAccount(tx, input.accountId);
    const { secret: _secret, orgId: _orgId, ...account } = row;
    const key = await webhookKeyOf(tx, row);

    return {
      account,
      queues: await tx
        .select(queueColumns)
        .from(callQueues)
        .where(eq(callQueues.accountId, row.id))
        .orderBy(callQueues.queue),
      operators: await tx
        .select({
          ...operatorColumns,
          hasSipPassword: sql<boolean>`${callOperators.sipSecret} is not null`,
        })
        .from(callOperators)
        .where(eq(callOperators.accountId, row.id))
        .orderBy(callOperators.extension),
      webhookUrl: key && callWebhookUrl(row.provider, key),
      webhookSecret: row.provider === 'call' ? call.open(row).account.secret.webhookSecret : null,
      inChannel: await takesCalls(tx, row),
      relayed: row.provider === 'call' && config.pbxRelay !== null,
    };
  });

/** A PBX account, refusing a CallPro line, which has no settings past its number. */
const pbxAccount = async (tx: Tx, id: string) => {
  const row = await phoneAccount(tx, id);

  if (row.provider !== 'call')
    throw new ORPCError('BAD_REQUEST', { message: 'A CallPro line has no queues or operators' });

  return row;
};

/**
 * Saves a PBX's settings and name, the queues frontline follows and the members who answer it by
 * extension, as `saveLines` keeps them. A change of its trunks or queues routes them through
 * pbx-relay first, before the transaction opens, so a refusal saves nothing.
 */
const saveSettings = writesWithCore(
  PERMISSIONS.integrationManage,
  PbxInput.extend({
    accountId: z.string(),
    ...Lines,
  }),
  async (member, input) => {
    if (!config.pbxRelay) return;

    const { row, queues, key } = await withOrg(member.orgId, async (tx) => {
      const pbx = await pbxAccount(tx, input.accountId);

      return {
        row: pbx,
        queues: await followedQueues(tx, pbx.id),
        key: await webhookKeyOf(tx, pbx),
      };
    });

    const { config: stored, secret } = call.open(row).account;
    const wanted = input.queues.map(({ queue }) => queue);

    if (sameRoute([stored, queues], [input, wanted])) return;

    const pbx = {
      id: row.id,
      host: stored.host,
      srcTrunk: input.srcTrunk,
      dstTrunk: input.dstTrunk,
      webhookSecret: secret.webhookSecret,
    };

    await routeCalls(pbx, wanted, key).catch(relayRefused);
  },
)
  .route({
    summary: "Save a phone system's settings, name, followed queues and operators by extension",
  })
  .output(Account)
  .handler(async ({ input, context: { tx, member } }) => {
    const { accountId, queues, operators, name, ...changes } = input;
    const row = await pbxAccount(tx, accountId);

    const { config: stored } = call.open(row).account;

    const [saved] = await tx
      .update(integrationAccounts)
      .set({
        config: { ...stored, ...changes },
        name: name || changes.phone,
      })
      .where(eq(integrationAccounts.id, accountId))
      .returning(accountColumns);

    await saveLines(tx, member.orgId, accountId, { queues, operators });

    if (!saved) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return saved;
  });

export const callProcedures = { connect, settings, saveSettings };

export const callProProcedures = { connect: connectCallPro };
