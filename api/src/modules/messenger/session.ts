import { hkdfSync } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import { z } from 'zod';
import { config } from '#/config.ts';
import { INTEGRATION_KEY } from '../inbox/integrations.ts';
import { openedBy } from '../public.ts';

/** The visitor tokens' signing key, derived from the plugin's secret so it needs no setting of its own. */
const secret = new Uint8Array(
  hkdfSync('sha256', config.pluginSecret, '', 'frontline messenger visitors', 32),
);

/** Who a visitor is: the organisation, the messenger and the core customer behind them. */
export const Visitor = z.object({
  orgId: z.string(),
  integrationId: z.string(),
  customerId: z.string(),
});

export type Visitor = z.infer<typeof Visitor>;

/** A signed token naming the visitor, which the messenger keeps and sends back. */
export const tokenOf = (visitor: Visitor) =>
  new SignJWT(visitor)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('180d')
    .sign(secret);

/** The visitor a token names, or null when it is forged, expired or for another messenger. */
export const visitorOf = async (token: string | undefined) => {
  if (!token) return null;

  const verified = await jwtVerify(token, secret, { algorithms: ['HS256'] }).catch(() => null);
  const visitor = Visitor.safeParse(verified?.payload);

  return visitor.success ? visitor.data : null;
};

/** The organisation and integration a messenger's key opens, or null for an unknown key. */
export const messengerOf = async (key: string) => {
  const row = await openedBy(key, [INTEGRATION_KEY]);

  return row ? { orgId: row.orgOf, integrationId: row.targetId } : null;
};
