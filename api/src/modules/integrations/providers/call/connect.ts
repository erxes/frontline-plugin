import { randomBytes } from 'node:crypto';
import { ORPCError } from '@orpc/server';
import { and, eq, getTableColumns, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { config } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { callOperators, callQueues } from '#/db/calls.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { publicKeys } from '#/db/public.ts';
import { isBlockedIp } from '#/modules/outbound.ts';
import { reads, writes, writesWithCore } from '#/orpc.ts';
import {
  Account,
  accountColumns,
  accountRow,
  Into,
  intoChannel,
  saveAccount,
} from '../../store.ts';
import { call, callApi } from './call.ts';
import { Lines, saveLines } from './lines.ts';
import { checkPbx } from './pbx.ts';

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

/**
 * Connects a Grandstream UCM: frontline signs in to it as the install's API user
 * (`CALL_API_USER`), before the transaction opens, then hands out the address and secret its
 * bridge signs posts with. Its queues and operators can come with it, as the old form took them.
 * Connecting the same PBX again replaces its settings and key.
 */
const connect = writesWithCore(
  PERMISSIONS.integrationManage,
  PbxInput.extend({
    host: Host,
    queues: Lines.queues.default([]),
    operators: Lines.operators.default([]),
    ...Into,
  }),
  async (member, input) => {
    const refused = await checkPbx({
      orgId: member.orgId,
      host: input.host,
      ...callApi(),
    });

    if (refused) throw new ORPCError('BAD_REQUEST', { message: refused });
  },
)
  .output(Account)
  .handler(async ({ input, context: { tx, member } }) => {
    const { channelId, name, queues, operators, ...settings } = input;

    const account = await saveAccount(
      tx,
      member,
      {
        provider: 'call',
        externalId: input.host.toLowerCase(),
        name: name || input.phone,
        config: settings,
        secret: {
          webhookSecret: randomBytes(32).toString('hex'),
        },
        webhookKey: newKey(),
      },
      await intoChannel(tx, member, channelId),
    );

    await saveLines(tx, member.orgId, account.id, { queues, operators });

    return account;
  });

/** Connects a CallPro line by its number; CallPro posts its calls to the address frontline gives. */
const connectCallPro = writes(PERMISSIONS.integrationManage)
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

/** The phone account's address its posts go to, for the provider's `<key>`. */
const webhookUrl = async (tx: Tx, accountId: string, provider: string) => {
  const [key] = await tx
    .select({ key: publicKeys.key })
    .from(publicKeys)
    .where(and(eq(publicKeys.kind, provider), eq(publicKeys.targetId, accountId)));

  return key ? `${config.publicUrl}/api/public/webhooks/${provider}/${key.key}` : null;
};

const phoneAccount = async (tx: Tx, id: string) => {
  const row = await accountRow(tx, id);

  if (row.provider !== 'call' && row.provider !== 'callpro')
    throw new ORPCError('NOT_FOUND', { message: 'No such phone account' });

  return row;
};

/**
 * A phone account's settings: its queues, its operators, and where its posts go. A PBX's bridge
 * signs with `webhookSecret`; a CallPro address is its own secret.
 */
const settings = reads(PERMISSIONS.integrationManage)
  .input(z.object({ accountId: z.string() }))
  .output(
    z.object({
      account: Account,
      queues: z.array(Queue),
      operators: z.array(Operator),
      webhookUrl: z.string().nullable(),
      webhookSecret: z.string().nullable(),
    }),
  )
  .handler(async ({ input, context: { tx } }) => {
    const row = await phoneAccount(tx, input.accountId);
    const { secret: _secret, orgId: _orgId, ...account } = row;

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
      webhookUrl: await webhookUrl(tx, row.id, row.provider),
      webhookSecret: row.provider === 'call' ? call.open(row).account.secret.webhookSecret : null,
    };
  });

/**
 * Saves a PBX's settings and name, the queues frontline follows and the members who answer it by
 * extension, as `saveLines` keeps them.
 */
const saveSettings = writes(PERMISSIONS.integrationManage)
  .input(
    PbxInput.extend({
      accountId: z.string(),
      ...Lines,
    }),
  )
  .output(Account)
  .handler(async ({ input, context: { tx, member } }) => {
    const { accountId, queues, operators, name, ...changes } = input;
    const row = await phoneAccount(tx, accountId);

    if (row.provider !== 'call')
      throw new ORPCError('BAD_REQUEST', { message: 'A CallPro line has no queues or operators' });

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
