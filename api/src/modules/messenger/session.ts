import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { currentCustomer } from '../contacts/merges.ts';
import { filesOf } from '../files.ts';
import { INTEGRATION_KEY } from '../inbox/insertIntegration.ts';
import { openedBy } from '../public.ts';
import { readToken, signToken } from '../tokens.ts';

/** Who a visitor is: the organisation, the messenger and the core customer behind them. */
export const Visitor = z.object({
  orgId: z.string(),
  integrationId: z.string(),
  customerId: z.string(),
  /** Whether the visitor left an email or phone, which a messenger with `requireAuth` asks for. */
  identified: z.boolean(),
  /**
   * Whether the website signed the visitor in as `customerId`. Otherwise the customer is the
   * visitor's own lead, which no one else's email or phone ever turns into another customer.
   */
  verified: z.boolean(),
});

export type Visitor = z.output<typeof Visitor>;

/** A signed token naming the visitor, which the messenger keeps and sends back. */
export const tokenOf = (visitor: Visitor) => signToken('messenger visitors', visitor, '180d');

/** Visitors whose token names a customer since merged into another, with that customer's id. */
const followed = new WeakMap<Visitor, string>();

/**
 * The visitor a token names, or null when it is forged or expired. A customer core merged into
 * another since the token was signed is that other customer now; `connect` signs a new token.
 */
export const visitorOf = async (token: string | undefined) => {
  const visitor = token ? await readToken('messenger visitors', token, Visitor) : null;

  if (!visitor) return null;

  const customerId = await currentCustomer(visitor.orgId, visitor.customerId);

  if (customerId === visitor.customerId) return visitor;

  const now = { ...visitor, customerId };

  followed.set(now, visitor.customerId);

  return now;
};

/** The token to hand back to a visitor who sent `token`: it, unless it names a merged customer. */
export const tokenFor = (visitor: Visitor, token: string | undefined) =>
  token && !followed.has(visitor) ? token : tokenOf(visitor);

/** Whom a visitor's file receipts are for: that customer, on that messenger. */
export const visitorReceiptOwner = (visitor: Visitor) =>
  `messenger ${visitor.integrationId} ${visitor.customerId}`;

/**
 * The files the visitor's receipts name; a forged, expired or foreign one is refused. A receipt
 * given before the visitor's customer was merged is theirs too.
 */
export const attachmentsOf = async (visitor: Visitor, receipts: string[]) => {
  const before = followed.get(visitor);
  const owners = [visitor, ...(before ? [{ ...visitor, customerId: before }] : [])];

  const files = await filesOf(owners.map(visitorReceiptOwner), receipts);

  if (!files) throw new ORPCError('BAD_REQUEST', { message: 'Attach the file again' });

  return files;
};

/** The organisation and integration a messenger's key opens, or null for an unknown key. */
export const messengerOf = async (key: string) => {
  const row = await openedBy(key, [INTEGRATION_KEY]);

  return row ? { orgId: row.orgOf, integrationId: row.targetId } : null;
};
