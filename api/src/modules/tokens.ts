import { hkdfSync } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';
import type { z } from 'zod';
import { config } from '#/config.ts';

/**
 * What frontline signs for itself, each with its own key: a visitor's session, a file receipt, a
 * form link, an OAuth `state`. A token for one purpose never passes for another.
 */
type Purpose = 'messenger visitors' | 'file receipts' | 'form links' | 'meta login';

const keys = new Map<Purpose, Uint8Array>();

/** The purpose's signing key, derived from the plugin's secret so it needs no setting of its own. */
const keyOf = (purpose: Purpose) => {
  const key =
    keys.get(purpose) ??
    new Uint8Array(hkdfSync('sha256', config.pluginSecret, '', `frontline ${purpose}`, 32));

  keys.set(purpose, key);

  return key;
};

/** `payload` signed for `purpose`, good until `expires`, for `subject` alone when one is named. */
export const signToken = (
  purpose: Purpose,
  payload: Record<string, unknown>,
  expires: string | Date,
  subject?: string,
) => {
  const token = new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expires);

  return (subject ? token.setSubject(subject) : token).sign(keyOf(purpose));
};

/**
 * The payload of a `signToken` token for `purpose` and `subject`, read through `schema`, or null
 * when it is forged, expired or someone else's.
 */
export const readToken = async <T>(
  purpose: Purpose,
  token: string,
  schema: z.ZodType<T>,
  subject?: string,
) => {
  const verified = await jwtVerify(token, keyOf(purpose), { algorithms: ['HS256'], subject }).catch(
    () => null,
  );

  const payload = schema.safeParse(verified?.payload);

  return payload.success ? payload.data : null;
};
