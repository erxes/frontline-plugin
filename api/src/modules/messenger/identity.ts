import { createHmac, randomBytes } from 'node:crypto';
import type { PluginMember } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { core } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { messengerSecrets } from '#/db/messenger.ts';
import { customerFor } from '../inbox/receive.ts';
import { openSecret, sameText, sealSecret } from '../integrations/secrets.ts';
import { messenger } from './adapter.ts';

/**
 * Who the visitor says they are. Unsigned, an email or phone only fills in their own lead. With
 * `hash`, the website's HMAC-SHA256 in hex of `userId`, else `email`, else `phone`, under the
 * messenger's identity secret, the visitor becomes the customer that value names.
 */
export const Identity = z
  .object({
    email: z.email({ error: 'Leave a valid email' }).max(320).optional(),
    phone: z.string().trim().min(3, { error: 'Leave a longer phone number' }).max(50).optional(),
    /** The website's own id for the visitor; counts only when signed. */
    userId: z.string().trim().min(1).max(200).optional(),
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    hash: z.string().max(200).optional(),
  })
  .refine((identity) => identity.email ?? identity.phone ?? (identity.userId && identity.hash), {
    message: 'Leave an email or a phone number',
    path: ['email'],
  });

export type Identity = z.infer<typeof Identity>;

const Sealed = z.object({ identitySecret: z.string() });

/** The messenger's identity secret, or null before a member makes one. */
export const identitySecretOf = async (tx: Tx, orgId: string, integrationId: string) => {
  const [row] = await tx
    .select({ secret: messengerSecrets.secret })
    .from(messengerSecrets)
    .where(eq(messengerSecrets.integrationId, integrationId));

  return row ? openSecret(orgId, row.secret, Sealed).identitySecret : null;
};

/** A new identity secret for the messenger. Signatures made with the old one stop working. */
export const rotateIdentitySecret = async (tx: Tx, member: PluginMember, integrationId: string) => {
  const identitySecret = randomBytes(32).toString('base64url');
  const secret = sealSecret(member.orgId, { identitySecret });

  await tx
    .insert(messengerSecrets)
    .values({ orgId: member.orgId, integrationId, secret, createdBy: member.userId })
    .onConflictDoUpdate({
      target: [messengerSecrets.orgId, messengerSecrets.integrationId],
      set: { secret },
    });

  return identitySecret;
};

/**
 * The core customer a signed identity names, made a lead when there is none, or null when the
 * identity carries no signature. A signature the secret didn't make is FORBIDDEN. Only the signed
 * value finds the customer: a signed user id never looks up the unsigned email beside it.
 */
export const signedCustomer = async (
  { orgId, integrationId }: { orgId: string; integrationId: string },
  identity: Identity,
) => {
  if (!identity.hash) return null;

  const secret = await withOrg(orgId, (tx) => identitySecretOf(tx, orgId, integrationId));
  const signed = identity.userId ?? identity.email ?? identity.phone ?? '';

  if (
    !secret ||
    !sameText(createHmac('sha256', secret).update(signed).digest('hex'), identity.hash)
  )
    throw new ORPCError('FORBIDDEN', { message: "The visitor's signature doesn't match" });

  if (identity.userId)
    return customerFor(orgId, {
      source: messenger.kind,
      externalId: `user:${identity.userId}`,
      firstName: identity.firstName ?? 'Visitor',
    });

  const { customer } = await core.forOrg(orgId).customers.findOrCreate({
    ...(identity.email ? { primaryEmail: identity.email } : { primaryPhone: identity.phone }),
    firstName: identity.firstName,
    lastName: identity.lastName,
    state: 'lead',
    source: messenger.kind,
  });

  return customer.id;
};
