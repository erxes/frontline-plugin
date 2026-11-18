import { timingSafeEqual } from 'node:crypto';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToUtf8, managedNonce, utf8ToBytes } from '@noble/ciphers/utils.js';
import type { z } from 'zod';
import { config } from '#/config.ts';

const VERSION = 'v1';

/** XChaCha20-Poly1305 with a random nonce per message, under `SECRETS_KEY`. */
const cipherFor = (orgId: string) =>
  managedNonce(xchacha20poly1305)(config.secretsKey, utf8ToBytes(orgId));

/**
 * A provider's secrets (page token, bot token, mail password) as stored: encrypted and bound to
 * the organisation, so a row copied into another organisation doesn't decrypt.
 */
export const sealSecret = (orgId: string, secret: Record<string, unknown>) =>
  `${VERSION}:${Buffer.from(cipherFor(orgId).encrypt(utf8ToBytes(JSON.stringify(secret)))).toString('base64url')}`;

/** The secrets `sealSecret` stored, checked against the provider's schema. */
export const openSecret = <T>(orgId: string, sealed: string, schema: z.ZodType<T>) => {
  const [version, body] = sealed.split(':');

  if (version !== VERSION || !body) throw new Error('Unknown secret format');

  const plain = bytesToUtf8(cipherFor(orgId).decrypt(Buffer.from(body, 'base64url')));

  return schema.parse(JSON.parse(plain));
};

/** Whether `received` is `expected`, compared in constant time. */
export const sameText = (expected: string, received: unknown) =>
  typeof received === 'string' &&
  Buffer.byteLength(received) === Buffer.byteLength(expected) &&
  timingSafeEqual(Buffer.from(received), Buffer.from(expected));
