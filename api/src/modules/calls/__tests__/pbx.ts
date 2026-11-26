import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { vi } from 'vite-plus/test';
import { z } from 'zod';
import { clientAs } from '#/test/member.ts';
import { channelFor, serve } from '../../integrations/__tests__/fakes.ts';

export const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const Request = z.object({
  request: z.object({ action: z.string() }).catchall(z.unknown()),
});

const realFetch = globalThis.fetch;

/** What the fake UCM answers each action with, past signing in and recordings. */
const ANSWERS: Record<string, unknown> = {
  listAccount: {
    account: [
      { extension: 1001, fullname: 'Bold Bat', status: 'Idle' },
      { extension: '1002', fullname: 'Saraa Dorj', status: 'InUse' },
    ],
  },
  listBridgedChannels: {
    channel: [
      {
        callerid1: '88001122',
        channel1: 'PJSIP/trunk-0002',
        callerid2: '1002',
        channel2: 'PJSIP/1002-0003',
      },
    ],
  },
};

/** A call frontline made to pbx-relay, as an action of the fake PBX's. */
interface RelayCall {
  action: 'relay';
  method: string;
  path: string;
  authorization: string | null;
  body: unknown;
}

/** pbx-relay taking every route: a PUT answers the route as stored, a DELETE 204. */
const relayTakes = ({ method, path, body }: RelayCall) =>
  method === 'DELETE'
    ? new Response(null, { status: 204 })
    : Response.json({ id: path.split('/').at(-1), ...z.object({}).loose().parse(body) });

/** The calls frontline made to pbx-relay among the fake PBX's actions, oldest first. */
export const relayed = (actions: Record<string, unknown>[]) =>
  actions.filter((action) => action.action === 'relay');

/**
 * A Grandstream UCM at `pbx.test` whose API user's password is `password`, `secret` as the tests'
 * `CALL_API_PASSWORD` has it, core's storage, and pbx-relay answering as `relay` does. Returns the
 * actions frontline asked of the PBX and the relay, newest last.
 */
export const fakePbx = ({
  password = 'secret',
  relay = relayTakes,
  answers = {},
}: {
  password?: string;
  relay?: (call: RelayCall) => Response;
  /** What the PBX answers an action with, over `ANSWERS`. */
  answers?: Record<string, unknown>;
} = {}) => {
  const actions: Record<string, unknown>[] = [];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const request = new globalThis.Request(input, init);
    const url = new URL(request.url);

    if (url.hostname === '127.0.0.1') return realFetch(request);

    if (url.hostname === 'files.core.test') return new Response(null, { status: 200 });

    if (url.hostname === 'pbx-relay.example') {
      const text = await request.text();

      const call: RelayCall = {
        action: 'relay',
        method: request.method,
        path: url.pathname,
        authorization: request.headers.get('authorization'),
        body: text ? z.json().parse(JSON.parse(text)) : null,
      };

      actions.push({ ...call });

      return relay(call);
    }

    const { request: asked } = Request.parse(await request.json());

    actions.push(asked);

    switch (asked.action) {
      case 'challenge':
        return Response.json({ status: 0, response: { challenge: 'abc123' } });
      case 'login': {
        const good = createHash('md5').update(`abc123${password}`).digest('hex');

        return Response.json(
          asked.token === good ? { status: 0, response: { cookie: 'cookie-1' } } : { status: -37 },
        );
      }

      case 'recapi':
        return new Response(new Uint8Array([82, 73, 70, 70]), {
          headers: { 'content-type': 'audio/wav' },
        });
      default:
        return Response.json({
          status: 0,
          response: answers[asked.action] ?? ANSWERS[asked.action] ?? { need_apply: 'no' },
        });
    }
  });

  return actions;
};

export const PBX = {
  host: 'pbx.test',
  phone: '77001100',
  timeZone: 'Asia/Ulaanbaatar',
};

/** The test's API server, and PBXes connected to it. */
export const pbxServer = () => {
  const { deliver } = serve();

  /** A connected PBX in `orgId` with queue 6500, its operators and a channel for its calls. */
  const connectPbx = async (orgId: string) => {
    const owner = clientAs(orgId);
    const account = await owner.integrations.call.connect(PBX);

    await owner.integrations.call.saveSettings({
      accountId: account.id,
      ...PBX,
      queues: [{ queue: '6500', name: 'Sales' }],
      operators: [
        { userId: 'user-bold', extension: '1001' },
        { userId: 'user-saraa', extension: '1002' },
      ],
    });

    await channelFor(orgId, 'call', account.id);

    const settings = await owner.integrations.call.settings({ accountId: account.id });

    const path = new URL(settings.webhookUrl ?? '').pathname.replace('/api/public/webhooks', '');
    const secret = settings.webhookSecret ?? '';

    /** Posts `raw` to the PBX's `kind` address, signed as pbx-relay signs. */
    const post = (kind: string, raw: string, signedWith = secret) => {
      const timestamp = String(Date.now());

      const signature = createHmac('sha256', signedWith)
        .update(`${timestamp}.${raw}`)
        .digest('hex');

      return deliver(`${path}/${kind}`, raw, {
        'x-erxes-timestamp': timestamp,
        'x-erxes-signature': signature,
      });
    };

    return { owner, account, post, path };
  };

  return { deliver, connectPbx };
};
