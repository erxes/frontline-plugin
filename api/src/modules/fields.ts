import { z } from 'zod';

/** A record's name or title. */
export const Title = z.string().trim().min(1).max(200);

/** Optional text: blank becomes null, so a cleared field reads as unset. */
export const Blank = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

/** A hex colour such as `#4F46E5`, as erxes-ui's ColorPicker writes it. */
export const Color = z.string().regex(/^#[0-9a-f]{6}$/i);

export const Stamps = { createdBy: z.string(), createdAt: z.date(), updatedAt: z.date() };
