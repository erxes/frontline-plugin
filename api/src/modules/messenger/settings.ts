import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { reads } from '#/orpc.ts';
import { integrationById } from '../inbox/integrations.ts';
import { MessengerConfig, messenger } from './adapter.ts';

/**
 * A messenger with its settings read through their schema, for its settings page; the page
 * saves them with `integrations.update`, which checks them again.
 */
const settings = reads(PERMISSIONS.channelView)
  .input(z.object({ id: z.string() }))
  .output(
    z.object({
      id: z.string(),
      name: z.string(),
      publicKey: z.string().nullable(),
      canManage: z.boolean(),
      config: MessengerConfig,
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    const row = await integrationById(tx, member, input.id);

    if (row.kind !== messenger.kind)
      throw new ORPCError('NOT_FOUND', { message: 'No such messenger' });

    return { ...row, config: MessengerConfig.parse(row.config) };
  });

export const messengerProcedures = { settings };
