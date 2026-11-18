import { createHash } from 'node:crypto';
import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { config } from '#/config.ts';
import { reachableOnly } from '#/modules/outbound.ts';

/** Where a Grandstream UCM's HTTPS API answers, and the API user frontline signs in as. */
export interface Pbx {
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

class PbxError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`The PBX refused: ${STATUS_TEXT[status] ?? `status ${status}`}`);
    this.status = status;
  }
}

/** Signed-in sessions by PBX and user. A session lasts until the UCM answers -6. */
const cookies = new Map<string, string>();

const keyOf = (pbx: Pbx) => `${pbx.user}@${pbx.host}`;

const post = (pbx: Pbx, request: Record<string, unknown>) =>
  fetch(`https://${pbx.host}/api`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ request }),
    signal: AbortSignal.timeout(config.outboundMs),
    // A member names the host, so it may only be a public address, and a UCM's API never
    // redirects, so neither does this.
    dispatcher: reachableOnly,
    redirect: 'error',
  });

const ask = async (pbx: Pbx, request: Record<string, unknown>) => {
  const answer = Answer.parse(await (await post(pbx, request)).json());

  if (answer.status !== 0) throw new PbxError(answer.status);

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

  cookies.set(keyOf(pbx), cookie);

  return cookie;
};

/** Runs `action` with a signed-in session, signing in again once when the session expired. */
const withSession = async <T>(pbx: Pbx, run: (cookie: string) => Promise<T>) => {
  const cookie = cookies.get(keyOf(pbx)) ?? (await login(pbx));

  try {
    return await run(cookie);
  } catch (error) {
    if (!(error instanceof PbxError) || error.status !== -6) throw error;

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
  cookies.delete(keyOf(pbx));

  return login(pbx).then(
    () => null,
    (error: unknown) => (error instanceof Error ? error.message : 'The PBX did not answer'),
  );
};

/** A call recording's bytes, from its `<dir>/<file>` on the PBX (`recordingOf`). */
export const downloadRecording = (pbx: Pbx, path: string) =>
  withSession(pbx, async (cookie) => {
    const [filedir, filename = ''] = path.split('/');
    const response = await post(pbx, { action: 'recapi', cookie, filedir, filename });

    // The UCM answers a refusal as JSON and a recording as audio.
    if (response.headers.get('content-type')?.includes('json')) {
      const answer = Answer.parse(await response.json());

      throw new PbxError(answer.status);
    }

    return {
      name: filename,
      contentType: response.headers.get('content-type') ?? 'audio/wav',
      bytes: new Uint8Array(await response.arrayBuffer()),
    };
  });
