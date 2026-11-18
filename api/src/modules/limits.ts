import { getTableName } from 'drizzle-orm';
import type { RequestHandler, Response } from 'express';
import { RateLimiterPostgres, RateLimiterRes } from 'rate-limiter-flexible';
import { pool } from '#/db/client.ts';
import { rateLimits } from '#/db/public.ts';
import { fail } from './fail.ts';

/**
 * At most `points` requests a minute per key, counted in `frontline_rate_limits` so every replica
 * shares the count. A key over its limit is refused from memory until its minute ends, so a flood
 * costs Postgres one write per key and minute. The `cleaner` deletes rows that expired an hour
 * ago every 5 minutes, for every limiter.
 */
const limiter = (keyPrefix: string, points: number, cleaner = false) =>
  new RateLimiterPostgres({
    storeClient: pool,
    tableName: getTableName(rateLimits),
    tableCreated: true,
    clearExpiredByTimeout: cleaner,
    keyPrefix,
    points,
    duration: 60,
    inMemoryBlockOnConsumed: points + 1,
  });

/** Answers 429 with Retry-After for a request over its limit, or 500 when counting failed. */
const refuse = (res: Response, rejection: unknown) => {
  if (!(rejection instanceof RateLimiterRes)) return fail(res, rejection, 'rate limit');

  res
    .set('retry-after', String(Math.max(1, Math.ceil(rejection.msBeforeNext / 1000))))
    .status(429)
    .json({ message: 'Too many requests: try again in a minute' });
};

/** Counts each request against its visitor's IP, on `read` for GET and HEAD, else `write`. */
const byIp =
  (read: RateLimiterPostgres, write = read): RequestHandler =>
  async (req, res, next) => {
    const counted = req.method === 'GET' || req.method === 'HEAD' ? read : write;

    try {
      await counted.consume(req.ip ?? '');
    } catch (rejection) {
      return refuse(res, rejection);
    }

    next();
  };

/** Every signed-out request a website makes: 600 reads or 120 writes a minute per visitor IP. */
export const visitorIpLimit = byIp(limiter('ip-read', 600, true), limiter('ip-write', 120));

/** `/connect`, which can make a core lead, on top: 20 a minute per visitor IP. */
export const connectIpLimit = byIp(limiter('ip-connect', 20));

/** A message a visitor sends, on top: 30 a minute per visitor IP. */
export const sendIpLimit = byIp(limiter('ip-send', 30));

const perKey = { write: limiter('key-write', 3000), connect: limiter('key-connect', 1200) };

/**
 * Counts a write against the messenger or form key it goes to, from all its visitors together:
 * 3000 a minute, or 1200 connects. Answers 429 once the key is over, and is false once it has.
 */
export const underKeyLimit = async (res: Response, key: string, which: keyof typeof perKey) => {
  try {
    await perKey[which].consume(key);

    return true;
  } catch (rejection) {
    refuse(res, rejection);

    return false;
  }
};
