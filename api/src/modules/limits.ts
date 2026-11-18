import { getTableName } from 'drizzle-orm';
import type { Request, RequestHandler, Response } from 'express';
import ipaddr from 'ipaddr.js';
import { RateLimiterMemory, RateLimiterPostgres, RateLimiterRes } from 'rate-limiter-flexible';
import { pool } from '#/db/client.ts';
import { rateLimits } from '#/db/public.ts';
import { fail } from './fail.ts';

/**
 * At most `points` requests a minute per key, counted in `frontline_rate_limits` so every replica
 * shares the count. A key over its limit is refused from memory until its minute ends, so a flood
 * costs Postgres one write per key and minute. While Postgres fails, each replica counts in its
 * own memory instead. The `cleaner` deletes rows that expired an hour ago every 5 minutes, for
 * every limiter.
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
    insuranceLimiter: new RateLimiterMemory({ keyPrefix, points, duration: 60 }),
  });

/** Answers 429 with Retry-After for a request over its limit, or 500 when counting failed. */
const refuse = (res: Response, rejection: unknown) => {
  if (!(rejection instanceof RateLimiterRes)) return fail(res, rejection, 'rate limit');

  res
    .set('retry-after', String(Math.max(1, Math.ceil(rejection.msBeforeNext / 1000))))
    .status(429)
    .json({ message: 'Too many requests: try again in a minute' });
};

/**
 * Who a request counts as: its IPv4 address, or its IPv6 address's /64, since one host holds a
 * whole /64 and could take a new address for each request.
 */
const visitorIp = (ip = '') => {
  if (!ipaddr.isValid(ip)) return ip;

  const address = ipaddr.process(ip);

  return address instanceof ipaddr.IPv6
    ? `${address.parts
        .slice(0, 4)
        .map((part) => part.toString(16))
        .join(':')}::/64`
    : address.toString();
};

/** Counts `req` against its visitor's IP on `counted`; answers 429 and is false once it's over. */
const underIpLimit = async (req: Request, res: Response, counted: RateLimiterPostgres) => {
  try {
    await counted.consume(visitorIp(req.ip));

    return true;
  } catch (rejection) {
    refuse(res, rejection);

    return false;
  }
};

/** Counts each request against its visitor's IP, on `read` for GET and HEAD, else `write`. */
const byIp =
  (read: RateLimiterPostgres, write = read): RequestHandler =>
  async (req, res, next) => {
    if (await underIpLimit(req, res, req.method === 'GET' || req.method === 'HEAD' ? read : write))
      next();
  };

/** Every signed-out request a website makes: 600 reads or 120 writes a minute per visitor IP. */
export const visitorIpLimit = byIp(limiter('ip-read', 600, true), limiter('ip-write', 120));

const lead = limiter('ip-lead', 20);

/**
 * A request about to make a core lead or customer, a new messenger visitor or a form
 * submission, on top: 20 a minute per visitor IP, shared by both. Answers 429 and is false once
 * it's over.
 */
export const underLeadLimit = (req: Request, res: Response) => underIpLimit(req, res, lead);

/** `underLeadLimit`, before a form submission. */
export const leadIpLimit: RequestHandler = async (req, res, next) => {
  if (await underLeadLimit(req, res)) next();
};

/** A message a visitor sends, on top: 30 a minute per visitor IP. */
export const sendIpLimit = byIp(limiter('ip-send', 30));

/**
 * An upload, on top and before its body is read: 10 a minute per visitor IP, so one IP buffers
 * and stores at most 250 MB a minute.
 */
export const uploadIpLimit = byIp(limiter('ip-upload', 10));

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
