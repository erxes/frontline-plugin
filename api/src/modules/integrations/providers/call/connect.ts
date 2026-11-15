import { randomBytes } from 'node:crypto';
import { ORPCError } from '@orpc/server';
import { and, eq, getTableColumns, notInArray, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { z } from 'zod';
import { config } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { callOperators, callQueues } from '#/db/calls.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { publicKeys } from '#/db/public.ts';
import { reads, writes } from '#/orpc.ts';
import { Account, accountColumns, accountRow, saveAccount } from '../../store.ts';
import { call, PbxConfig } from './call.ts';
import { checkPbx } from './pbx.ts';

const Host = z
  .string()
  .trim()
  .regex(/^[a-z0-9.-]+(:\d{1,5})?$/i, 'A host name, with a port if not 443');

const TimeZone = z.string().refine((zone) => Intl.supportedValuesOf('timeZone').includes(zone), {
  message: 'An IANA time zone, such as Asia/Ulaanbaatar',
});

const Phone = z.string().trim().min(3).max(30);

const PbxInput = z.object({
  phone: Phone,
  srcTrunk: z.string().trim().max(100).default(''),
  dstTrunk: z.string().trim().max(100).default(''),
  timeZone: TimeZone,
});

const newKey = () => randomBytes(24).toString('base64url');

/**
 * Connects a Grandstream UCM by its HTTPS API user: frontline signs in to check it, then hands out
 * the address and secret its bridge signs posts with. Connecting the same PBX again replaces its
 * credentials and key.
 */
const connect = writes(PERMISSIONS.integrationManage)
  .input(
    PbxInput.extend({
      host: Host,
      apiUser: z.string().trim().min(1).max(100),
      apiPassword: z.string().min(1).max(200),
    }),
  )
  .output(Account)
  .handler(async ({ input, context: { tx, member } }) => {
    const { apiUser, apiPassword, ...settings } = input;
    const refused = await checkPbx({ host: input.host, user: apiUser, password: apiPassword });

    if (refused) throw new ORPCError('BAD_REQUEST', { message: refused });

    return saveAccount(tx, member, {
      provider: 'call',
      externalId: input.host.toLowerCase(),
      name: input.phone,
      config: settings,
      secret: { apiUser, apiPassword, webhookSecret: randomBytes(32).toString('hex') },
      webhookKey: newKey(),
    });
  });

/** Connects a CallPro line by its number; CallPro posts its calls to the address frontline gives. */
const connectCallPro = writes(PERMISSIONS.integrationManage)
  .input(z.object({ phone: Phone }))
  .output(Account)
  .handler(async ({ input, context: { tx, member } }) =>
    saveAccount(tx, member, {
      provider: 'callpro',
      externalId: input.phone,
      name: input.phone,
      config: { phone: input.phone },
      secret: {},
      webhookKey: newKey(),
    }),
  );

const Queue = createSelectSchema(callQueues).omit({ orgId: true, live: true });
const Operator = createSelectSchema(callOperators).omit({ orgId: true });

const { orgId: _queueOrg, live: _live, ...queueColumns } = getTableColumns(callQueues);
const { orgId: _operatorOrg, ...operatorColumns } = getTableColumns(callOperators);

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
        .select(operatorColumns)
        .from(callOperators)
        .where(eq(callOperators.accountId, row.id))
        .orderBy(callOperators.extension),
      webhookUrl: await webhookUrl(tx, row.id, row.provider),
      webhookSecret: row.provider === 'call' ? call.open(row).account.secret.webhookSecret : null,
    };
  });

/**
 * Saves a PBX's settings, the queues frontline follows and the members who answer it by
 * extension. Queues and operators not listed go; a kept queue keeps its counters.
 */
const saveSettings = writes(PERMISSIONS.integrationManage)
  .input(
    PbxInput.extend({
      accountId: z.string(),
      queues: z
        .array(
          z.object({ queue: z.string().trim().min(1).max(30), name: z.string().trim().max(100) }),
        )
        .max(100),
      operators: z
        .array(z.object({ userId: z.string().min(1), extension: z.string().trim().min(1).max(30) }))
        .max(500),
    }),
  )
  .output(Account)
  .handler(async ({ input, context: { tx, member } }) => {
    const { accountId, queues, operators, ...changes } = input;
    const row = await phoneAccount(tx, accountId);

    if (row.provider !== 'call')
      throw new ORPCError('BAD_REQUEST', { message: 'A CallPro line has no queues or operators' });

    const [saved] = await tx
      .update(integrationAccounts)
      .set({ config: { ...PbxConfig.parse(row.config), ...changes }, name: changes.phone })
      .where(eq(integrationAccounts.id, accountId))
      .returning(accountColumns);

    await tx.delete(callQueues).where(
      and(
        eq(callQueues.accountId, accountId),
        notInArray(
          callQueues.queue,
          queues.map((queue) => queue.queue),
        ),
      ),
    );

    if (queues.length)
      await tx
        .insert(callQueues)
        .values(queues.map((queue) => ({ ...queue, orgId: member.orgId, accountId })))
        .onConflictDoUpdate({
          target: [callQueues.orgId, callQueues.accountId, callQueues.queue],
          set: { name: sql`excluded.name` },
        });

    // An operator whose extension changed goes first, so the unique keys hold; one that stayed
    // keeps its status.
    await tx.delete(callOperators).where(
      and(
        eq(callOperators.accountId, accountId),
        sql`${callOperators.userId} || ' ' || ${callOperators.extension} <> all(array[${sql.join(
          operators.map((operator) => sql`${`${operator.userId} ${operator.extension}`}`),
          sql`, `,
        )}]::text[])`,
      ),
    );

    if (operators.length)
      await tx
        .insert(callOperators)
        .values(operators.map((operator) => ({ ...operator, orgId: member.orgId, accountId })))
        .onConflictDoNothing();

    if (!saved) throw new ORPCError('INTERNAL_SERVER_ERROR');

    return saved;
  });

export const callProcedures = { connect, settings, saveSettings };

export const callProProcedures = { connect: connectCallPro };
