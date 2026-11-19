import { randomBytes } from 'node:crypto';
import { ORPCError } from '@orpc/server';
import { and, eq, inArray, type SQL } from 'drizzle-orm';
import { config } from '#/config.ts';
import { db, type Tx } from '#/db/client.ts';
import { publicKeys } from '#/db/public.ts';

/** The script a website adds to show the embed `name`, which reads `query` from its own address. */
export const widgetScript = (name: string, query: Record<string, string> = {}) => {
  const search = new URLSearchParams(query).toString();

  return `${config.publicUrl}/widget/${name}.js${search ? `?${search}` : ''}`;
};

/** The kind of key that opens an organisation's form embeds, its `targetId` the organisation. */
const ORGANIZATION_KEY = 'organization';

/**
 * The organisation and record a signed-out request's key opens, of the `kinds` its route serves,
 * or undefined for any other key.
 */
export const openedBy = async (key: string, kinds: string[]) => {
  const [row] = await db
    .select({ orgOf: publicKeys.orgOf, kind: publicKeys.kind, targetId: publicKeys.targetId })
    .from(publicKeys)
    .where(and(eq(publicKeys.key, key), inArray(publicKeys.kind, kinds)));

  return row;
};

/**
 * Deletes the organisation's keys that `where` matches. Row-level security can't scope this
 * table, which public routes read before they know the organisation, so this names it.
 */
export const removeKeys = (tx: Tx, organizationId: string, where: SQL | undefined) =>
  tx.delete(publicKeys).where(and(eq(publicKeys.orgOf, organizationId), where));

/** The organisation a signed-out request's key names, or undefined for a key frontline never gave. */
export const organizationOfKey = async (key: string) =>
  (await openedBy(key, [ORGANIZATION_KEY]))?.orgOf;

/** The organisation's public key, made the first time it is asked for. */
export const keyOfOrganization = async (tx: Tx, organizationId: string) => {
  await tx
    .insert(publicKeys)
    .values({
      key: randomBytes(16).toString('base64url'),
      orgOf: organizationId,
      kind: ORGANIZATION_KEY,
      targetId: organizationId,
    })
    .onConflictDoNothing({ target: [publicKeys.kind, publicKeys.targetId] });

  const [row] = await tx
    .select({ key: publicKeys.key })
    .from(publicKeys)
    .where(and(eq(publicKeys.kind, ORGANIZATION_KEY), eq(publicKeys.targetId, organizationId)));

  if (!row) throw new ORPCError('INTERNAL_SERVER_ERROR');

  return row.key;
};
