import { z } from 'zod';
import { config } from '#/config.ts';
import { logger } from '#/logger.ts';
import { providerApi } from '../integrations/providerApi.ts';

/** How long Cloudflare's credentials live. They are renewed once half of it is left. */
const TTL_MS = 86_400_000;

/** How long a failed request keeps this process from asking Cloudflare again. */
const BACKOFF_MS = 60_000;

/** One ICE server as WebRTC's `iceServers` take it. */
export const IceServer = z.object({
  urls: z.union([z.string(), z.array(z.string()).nonempty()]),
  username: z.string().optional(),
  credential: z.string().optional(),
});

/** Cloudflare's answer, whose `iceServers` is one server or a list of them. */
const Generated = z.object({
  iceServers: z.union([z.array(IceServer).nonempty(), IceServer.transform((one) => [one])]),
});

const cloudflareApi = providerApi({ name: 'Cloudflare TURN' });

let held: { iceServers: z.infer<typeof IceServer>[]; expiresAt: number } | null = null;
let retryAt = 0;
let asking: Promise<void> | null = null;

const ask = async ({ keyId, apiToken }: { keyId: string; apiToken: string }) => {
  const askedAt = Date.now();

  try {
    const answer = await cloudflareApi
      .post(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId)}/credentials/generate-ice-servers`,
        { headers: { authorization: `Bearer ${apiToken}` }, json: { ttl: TTL_MS / 1000 } },
      )
      .json();

    held = { iceServers: Generated.parse(answer).iceServers, expiresAt: askedAt + TTL_MS };
  } catch (error) {
    retryAt = Date.now() + BACKOFF_MS;
    logger.warn(
      { err: error, retryAt: new Date(retryAt) },
      'Cloudflare TURN credentials not renewed',
    );
  }
};

/**
 * The softphones' ICE servers: Cloudflare Realtime TURN credentials for the install's key, held
 * by this process and renewed once less than half their day is left, by one request at a time.
 * A failed request is retried after a minute, and until then the credentials still held serve.
 * None without a key, or once every request failed and the last credentials expired.
 */
export const turnIceServers = async () => {
  if (!config.turn) return [];

  const now = Date.now();

  if (now >= (held ? held.expiresAt - TTL_MS / 2 : 0) && now >= retryAt) {
    asking ??= ask(config.turn).finally(() => {
      asking = null;
    });
    await asking;
  }

  return held && held.expiresAt > Date.now() ? held.iceServers : [];
};
