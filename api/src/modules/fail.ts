import { ORPCError } from '@orpc/server';
import type { Response } from 'express';
import { z } from 'zod';
import { logger } from '#/logger.ts';

/**
 * Answers a plain Express route's refused request with its status (a typed oRPC error, or 400
 * for input zod refused), or logs anything unexpected as `what` failing and answers 500.
 */
export const fail = (res: Response, error: unknown, what: string) => {
  if (error instanceof ORPCError) {
    res.status(error.status).json({ message: error.message });

    return;
  }

  if (error instanceof z.ZodError) {
    res.status(400).json({ message: z.prettifyError(error) });

    return;
  }

  logger.error({ err: error }, `${what} failed`);
  res.status(500).json({ message: 'Something went wrong' });
};
