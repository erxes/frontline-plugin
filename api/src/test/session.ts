import { createHash } from 'node:crypto';
import { CORE_API_PREFIX } from '@erxes/core-contract';
import { exportJWK, generateKeyPair, type JWTPayload, SignJWT } from 'jose';
import { vi } from 'vite-plus/test';
import { config, PLUGIN } from '#/config.ts';

/**
 * Stands in for core's signing key: core's JWKS address answers with a test key, and every
 * other fetch goes through. Returns signers of the tokens core would issue: a member's session,
 * and a transfer request over its body.
 */
export const fakeCoreSessions = async () => {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const key = { ...(await exportJWK(publicKey)), kid: 'test', alg: 'ES256', use: 'sig' };
  const jwks = `${config.coreUrl.replace(/\/+$/, '')}${CORE_API_PREFIX}/.well-known/jwks.json`;
  const passThrough = globalThis.fetch;

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();

    return url === jwks ? Response.json({ keys: [key] }) : passThrough(input, init);
  });

  const sign = (typ: string, claims: JWTPayload, subject: string) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', kid: 'test', typ })
      .setIssuer('erxes-core')
      .setAudience(PLUGIN)
      .setSubject(subject)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);

  return {
    session: (orgId: string, userId: string, permissions: string[]) =>
      sign(
        'erxes-plugin-session+jwt',
        { org: orgId, role: 'member', permissions, tier: 'pro', access: 'full' },
        userId,
      ),
    transfer: (body: string, { requestId, orgId }: { requestId: string; orgId: string }) =>
      sign(
        'erxes-core-transfer+jwt',
        {
          org: orgId,
          transfer: requestId,
          sha: createHash('sha256').update(body).digest('base64url'),
        },
        'core',
      ),
  };
};
