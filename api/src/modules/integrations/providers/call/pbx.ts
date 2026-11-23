import { createHash } from 'node:crypto';
import { ORPCError } from '@orpc/server';
import { LRUCache } from 'lru-cache';
import { z } from 'zod';
import { config } from '#/config.ts';
import { reachableUnverified } from '#/modules/outbound.ts';
import { providerApi, ProviderRefused } from '../../providerApi.ts';

/** Where a Grandstream UCM's HTTPS API answers, and the API user frontline signs in as. */
export interface Pbx {
  /** The organisation that connected it: two may share a hosted UCM and its API user. */
  orgId: string;
  /** `pbx.example.com` or `pbx.example.com:8089`. */
  host: string;
  user: string;
  password: string;
}

/** The UCM's answer to every action: status 0 is success, -6 an expired cookie. */
const Answer = z.object({ status: z.number(), response: z.unknown().optional() });

/** What the UCM's statuses mean, for the errors frontline shows. */
const STATUS_TEXT: Record<number, string> = {
  [-1]: 'invalid parameters',
  [-5]: 'the API user needs a login',
  [-6]: 'the session expired',
  [-7]: 'the API user is not allowed this action',
  [-8]: 'the session timed out',
  [-9]: 'the PBX is busy',
  [-37]: 'wrong API user or password',
  [-68]: 'too many logins, try again later',
};

const NAME = 'The PBX';

/** The UCM's refusal of an action, by the status it answered. */
const refused = (status: number) =>
  new ProviderRefused(NAME, status, STATUS_TEXT[status] ?? `status ${status}`);

/**
 * Signed-in sessions by organisation, PBX and user, with the password each signed in with, so a
 * wrong password never rides on another's session. The UCM ends a session it hasn't seen for a
 * while with -6; one unused for 10 minutes goes from here too.
 */
const sessions = new LRUCache<string, { password: string; cookie: string }>({
  max: 1000,
  ttl: 10 * 60_000,
  updateAgeOnGet: true,
});

const keyOf = (pbx: Pbx) => [pbx.orgId, pbx.user, pbx.host].join(' ');

/** The session `pbx` signed in with, unless its password changed since. */
const sessionOf = (pbx: Pbx) => {
  const session = sessions.get(keyOf(pbx));

  return session?.password === pbx.password ? session.cookie : undefined;
};

const pbxApi = providerApi({
  name: NAME,
  // A member names the host, so it may only be a public address, and a UCM's API never
  // redirects, so neither does this. A UCM's certificate is often self-signed or lacks its
  // intermediate, so its certificate isn't checked, as the old plugin didn't.
  dispatcher: reachableUnverified,
  redirect: 'error',
});

const post = (pbx: Pbx, request: Record<string, unknown>) =>
  pbxApi.post(`https://${pbx.host}/api`, { json: { request } });

const ask = async (pbx: Pbx, request: Record<string, unknown>) => {
  const answer = await post(pbx, request).json(Answer);

  if (answer.status !== 0) throw refused(answer.status);

  return answer.response;
};

/** Signs in with the UCM's challenge: the token is md5 of the challenge and the password. */
const login = async (pbx: Pbx) => {
  const { challenge } = z
    .object({ challenge: z.string() })
    .parse(await ask(pbx, { action: 'challenge', user: pbx.user, version: '1.0' }));

  const token = createHash('md5')
    .update(challenge + pbx.password)
    .digest('hex');

  const { cookie } = z
    .object({ cookie: z.string() })
    .parse(await ask(pbx, { action: 'login', user: pbx.user, token }));

  sessions.set(keyOf(pbx), { password: pbx.password, cookie });

  return cookie;
};

/** Runs `action` with a signed-in session, signing in again once when the session expired. */
const withSession = async <T>(pbx: Pbx, run: (cookie: string) => Promise<T>) => {
  const cookie = sessionOf(pbx) ?? (await login(pbx));

  try {
    return await run(cookie);
  } catch (error) {
    if (!(error instanceof ProviderRefused) || error.status !== -6) throw error;

    return run(await login(pbx));
  }
};

/** One UCM API action, its `response` read through `Result`. */
export const pbxAction = <T>(
  pbx: Pbx,
  action: string,
  Result: z.ZodType<T>,
  params: Record<string, unknown> = {},
) =>
  withSession(pbx, async (cookie) => Result.parse(await ask(pbx, { action, cookie, ...params })));

/** A failed `pbxAction`, as the member sees it: 502 with the PBX's reason. */
export const pbxFailed = (error: unknown): never => {
  throw new ORPCError('BAD_GATEWAY', {
    message: error instanceof Error ? error.message : 'The PBX did not answer',
  });
};

/** Resolves to why the PBX refuses frontline's API user, or null while it signs in. */
export const checkPbx = async (pbx: Pbx) => {
  sessions.delete(keyOf(pbx));

  return login(pbx).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : 'The PBX did not answer'),
  );
};

/** A call recording's bytes, from its `<dir>/<file>` on the PBX (`recordingOf`). */
export const downloadRecording = (pbx: Pbx, path: string) =>
  withSession(pbx, async (cookie) => {
    const [filedir, filename = ''] = path.split('/');

    // The bytes come after the headers, so the whole download has a limit of its own.
    const response = await pbxApi.post(`https://${pbx.host}/api`, {
      json: { request: { action: 'recapi', cookie, filedir, filename } },
      signal: AbortSignal.timeout(4 * config.outboundMs),
    });

    // The UCM answers a refusal as JSON and a recording as audio.
    if (response.headers.get('content-type')?.includes('json')) {
      throw refused(Answer.parse(await response.json()).status);
    }

    return {
      name: filename,
      contentType: response.headers.get('content-type') ?? 'audio/wav',
      bytes: new Uint8Array(await response.arrayBuffer()),
    };
  });
