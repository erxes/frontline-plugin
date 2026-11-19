import { ORPCError } from '@orpc/server';
import type { Response } from 'express';
import { errors } from 'jose';
import { z } from 'zod';
import { logger } from '#/logger.ts';

/**
 * Answers a plain Express route's refused request with its status (a typed oRPC error, or 400
 * for input zod refused), or logs anything unexpected as `what` failing and answers 500. Refused
 * input answers with its first issue's own words, which the widgets show visitors as they are or
 * in the embed's language.
 */
export const fail = (res: Response, error: unknown, what: string) => {
  if (error instanceof ORPCError) {
    res.status(error.status).json({ message: error.message });

    return;
  }

  if (error instanceof z.ZodError) {
    res.status(400).json({ message: error.issues[0]?.message ?? 'Input validation failed' });

    return;
  }

  logger.error({ err: error }, `${what} failed`);
  res.status(500).json({ message: 'Something went wrong' });
};

/** Whether a token check failed because core's signing keys were out of reach, not the token. */
const coreDown = (error: unknown) =>
  error instanceof errors.JWKSTimeout ||
  error instanceof errors.JWKSInvalid ||
  (error instanceof errors.JOSEError && error.code === 'ERR_JOSE_GENERIC') ||
  error instanceof TypeError;

/**
 * What a token core signed names, or null once the request is answered: 401 with `refused` for
 * a token core didn't sign, and 503 while core's keys can't be read, so the caller tries again.
 * Both are logged with the reason.
 */
export const verifiedBy = async <T>(
  res: Response,
  what: string,
  refused: string,
  verify: () => Promise<T>,
) => {
  try {
    return await verify();
  } catch (error) {
    if (coreDown(error)) {
      logger.error({ err: error }, `${what}: core's signing keys are out of reach`);
      res.status(503).json({ message: 'erxes core is out of reach: try again shortly' });
    } else {
      logger.info({ reason: error instanceof Error ? error.message : error }, `${what} refused`);
      res.status(401).json({ message: refused });
    }

    return null;
  }
};
