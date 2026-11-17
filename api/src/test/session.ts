import { CORE_API_PREFIX } from '@erxes/core-contract';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { vi } from 'vite-plus/test';
import { config, PLUGIN } from '#/config.ts';

/**
 * Stands in for core's signing key: core's JWKS address answers with a test key, and every
 * other fetch goes through. Returns a signer of session tokens core would issue for a member.
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

  return (orgId: string, userId: string, permissions: string[]) =>
    new SignJWT({ org: orgId, role: 'member', permissions, tier: 'pro', access: 'full' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test', typ: 'erxes-plugin-session+jwt' })
      .setIssuer('erxes-core')
      .setAudience(PLUGIN)
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
};
