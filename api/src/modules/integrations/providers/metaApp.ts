import { ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import { type Tx, uniqueViolation, withOrg } from '#/db/client.ts';
import { metaApps } from '#/db/meta.ts';
import { publicKeys } from '#/db/public.ts';
import { reads, writes } from '#/orpc.ts';
import { openedBy, removeKeys } from '../../public.ts';
import { openSecret, sealSecret } from '../secrets.ts';

/** The kind of `frontline_public_keys` row a Meta app's verify token is. */
const VERIFY_KEY = 'meta-verify';

const verifyKey = (token: string) => `${VERIFY_KEY}:${token}`;

const Secret = z.object({ appSecret: z.string() });

/** The Meta app the organisation's pages connect through, and whether it is the install's. */
export type MetaApp = { appId: string; appSecret: string; own: boolean };

const installApp = (): MetaApp | null =>
  config.meta.appId && config.meta.appSecret
    ? { appId: config.meta.appId, appSecret: config.meta.appSecret, own: false }
    : null;

const ownApp = async (tx: Tx, orgId: string) => {
  const [row] = await tx.select().from(metaApps);

  return row ? { ...row, appSecret: openSecret(orgId, row.secret, Secret).appSecret } : null;
};

/** The organisation's own Meta app, else the install's (`META_APP_*`), else null. */
export const metaAppIn = async (tx: Tx, orgId: string): Promise<MetaApp | null> => {
  const own = await ownApp(tx, orgId);

  return own ? { appId: own.appId, appSecret: own.appSecret, own: true } : installApp();
};

/** `metaAppIn`, outside a request's transaction. */
export const metaAppOf = (orgId: string) => withOrg(orgId, (tx) => metaAppIn(tx, orgId));

/**
 * The secrets Meta may sign the organisation's pages' deliveries with: its own app's, and the
 * install's, which pages connected before the organisation set its own still go through.
 */
export const metaSecretsOf = async (orgId: string) => {
  const own = await withOrg(orgId, (tx) => ownApp(tx, orgId));

  return [own?.appSecret, installApp()?.appSecret].filter((secret) => secret !== undefined);
};

/** Whether Meta's address check names a verify token of the install or of an organisation's app. */
export const knownVerifyToken = async (token: string) =>
  (config.meta.verifyToken !== undefined && token === config.meta.verifyToken) ||
  (await openedBy(verifyKey(token), [VERIFY_KEY])) !== undefined;

/** Where Meta's webhook subscription points: every app, the install's or an organisation's. */
const webhookUrl = () => `${config.publicUrl}/api/public/webhooks/meta`;

/** Where Meta's login sends the member back; an app lists it as a valid OAuth redirect URI. */
export const metaCallbackUrl = () => `${webhookUrl()}/callback`;

const Settings = z.object({
  appId: z.string().nullable(),
  verifyToken: z.string().nullable(),
  /** The secret is never sent back; this says whether one is saved. */
  hasSecret: z.boolean(),
  /** Whether the organisation set its own app, rather than using the install's. */
  own: z.boolean(),
  /** Whether the install has an app the organisation falls back to. */
  installApp: z.boolean(),
  webhookUrl: z.string(),
  callbackUrl: z.string(),
});

const settingsOf = async (tx: Tx, orgId: string): Promise<z.infer<typeof Settings>> => {
  const own = await ownApp(tx, orgId);

  return {
    appId: own?.appId ?? null,
    verifyToken: own?.verifyToken ?? null,
    hasSecret: own !== null,
    own: own !== null,
    installApp: installApp() !== null,
    webhookUrl: webhookUrl(),
    callbackUrl: metaCallbackUrl(),
  };
};

/** The organisation's Meta app settings, without the secret. */
const get = reads(PERMISSIONS.integrationManage)
  .output(Settings)
  .handler(({ context: { tx, member } }) => settingsOf(tx, member.orgId));

/**
 * Saves the organisation's own Meta app: its id, its secret (kept when left out on a change) and
 * the verify token Meta's webhook subscription sends. A token another organisation uses is
 * refused, since Meta's address check finds the app by it.
 */
const save = writes(PERMISSIONS.integrationManage)
  .input(
    z.object({
      appId: z
        .string()
        .trim()
        .regex(/^\d{5,20}$/, 'A Meta app id is digits'),
      appSecret: z.string().trim().min(16).max(100).optional(),
      verifyToken: z.string().trim().min(8).max(200),
    }),
  )
  .output(Settings)
  .handler(async ({ input, context: { tx, member } }) => {
    const before = await ownApp(tx, member.orgId);
    const appSecret = input.appSecret ?? before?.appSecret;

    if (!appSecret) throw new ORPCError('BAD_REQUEST', { message: 'Enter the app secret' });

    const values = {
      appId: input.appId,
      secret: sealSecret(member.orgId, { appSecret }),
      verifyToken: input.verifyToken,
    };

    const [row] = await tx
      .insert(metaApps)
      .values({ ...values, orgId: member.orgId, createdBy: member.userId })
      .onConflictDoUpdate({ target: metaApps.orgId, set: values })
      .returning({ id: metaApps.id });

    if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR');

    await removeKeys(tx, member.orgId, eq(publicKeys.kind, VERIFY_KEY));
    await tx
      .insert(publicKeys)
      .values({
        key: verifyKey(input.verifyToken),
        orgOf: member.orgId,
        kind: VERIFY_KEY,
        targetId: row.id,
      })
      .catch((error: unknown) => {
        if (uniqueViolation(error))
          throw new ORPCError('CONFLICT', { message: 'Pick another verify token' });

        throw error;
      });

    return settingsOf(tx, member.orgId);
  });

/** Forgets the organisation's own Meta app, so its pages go back to the install's. */
const remove = writes(PERMISSIONS.integrationManage)
  .output(Settings)
  .handler(async ({ context: { tx, member } }) => {
    await tx.delete(metaApps);
    await removeKeys(tx, member.orgId, eq(publicKeys.kind, VERIFY_KEY));

    return settingsOf(tx, member.orgId);
  });

export const metaAppProcedures = { get, save, remove };
