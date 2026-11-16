import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { config } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import { reads } from '#/orpc.ts';
import { integrationById } from '../inbox/integrations.ts';
import { MessengerConfig, messenger } from './adapter.ts';

/** The script a website adds to show the messenger with `key`. */
const scriptOf = (key: string) =>
  `${config.publicUrl}/widget/messenger.js?key=${encodeURIComponent(key)}`;

/**
 * A messenger with its settings read through their schema, for its settings page, and the
 * script that embeds it; the page saves them with `integrations.update`, which checks them again.
 */
const settings = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(
    z.object({
      id: z.string(),
      name: z.string(),
      publicKey: z.string().nullable(),
      scriptUrl: z.string().nullable(),
      canManage: z.boolean(),
      config: MessengerConfig,
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    const row = await integrationById(tx, member, input.id);

    if (row.kind !== messenger.kind)
      throw new ORPCError('NOT_FOUND', { message: 'No such messenger' });

    return {
      ...row,
      scriptUrl: row.publicKey && scriptOf(row.publicKey),
      config: MessengerConfig.parse(row.config),
    };
  });

export const messengerProcedures = { settings };
