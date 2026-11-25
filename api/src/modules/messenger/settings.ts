import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { reads, writes } from '#/orpc.ts';
import { integrationById, integrationFor } from '../inbox/integrations.ts';
import { widgetScript } from '../public.ts';
import { MessengerConfig, messenger } from './adapter.ts';
import { identitySecretOf, rotateIdentitySecret } from './identity.ts';

const notFound = () => new ORPCError('NOT_FOUND', { message: 'No such messenger' });

/**
 * A messenger with its settings read through their schema, for its settings page, and the
 * script that embeds it; the page saves them with `integrations.update`, which checks them again.
 * Only a member who may change it sees the secret its website signs visitors with.
 */
const settings = reads(PERMISSIONS.channelView)
  .route({
    summary:
      "Get a messenger's settings and embed script; the identity secret only if you may change it",
  })
  .input(z.object({ id: z.string() }))
  .output(
    z.object({
      id: z.string(),
      name: z.string(),
      channelId: z.string(),
      publicKey: z.string(),
      scriptUrl: z.string(),
      /** The settings page's preview of the widget, which draws the settings the page posts. */
      previewUrl: z.string(),
      canManage: z.boolean(),
      identitySecret: z.string().nullable(),
      config: MessengerConfig,
    }),
  )
  .handler(async ({ input, context: { tx, member } }) => {
    const row = await integrationById(tx, member, input.id);

    if (row.kind !== messenger.kind) throw notFound();

    return {
      ...row,
      scriptUrl: widgetScript('messenger', { key: row.publicKey }),
      previewUrl: widgetScript('messenger-preview'),
      identitySecret: row.canManage ? await identitySecretOf(tx, member.orgId, row.id) : null,
      config: MessengerConfig.parse(row.config),
    };
  });

/** A new identity secret for a messenger the caller may change, in place of the old one. */
const rotateSecret = writes(PERMISSIONS.channelView)
  .route({
    summary:
      "Replace a messenger's identity secret; visitors signed with the old one stop verifying",
  })
  .input(z.object({ id: z.string() }))
  .output(z.object({ identitySecret: z.string() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const row = await integrationFor(tx, member, input.id);

    if (row.kind !== messenger.kind) throw notFound();

    return { identitySecret: await rotateIdentitySecret(tx, member, input.id) };
  });

export const messengerProcedures = { settings, rotateSecret };
