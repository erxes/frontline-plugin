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

/** A file on core's storage, as erxes-ui's Upload reports it. */
export const Attachment = z.object({
  url: z.string().max(2000),
  name: z.string().max(500),
  type: z.string().max(200).optional(),
  size: z.number().int().nonnegative().optional(),
});

export const Stamps = { createdBy: z.string(), createdAt: z.date(), updatedAt: z.date() };
