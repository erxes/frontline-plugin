import { createHmac } from 'node:crypto';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';

export const messenger = serve('/api/public/messenger');
export const api = serve('/api');

const Connected = z.object({
  token: z.string(),
  identified: z.boolean(),
  conversations: z.array(z.looseObject({ id: z.string() })),
});

/** What `/connect` answers a visitor who sends `body`. */
export const connect = async (body: Record<string, unknown>) =>
  Connected.parse((await messenger.post('/connect', body)).body);

export const Sent = z.object({ id: z.string(), conversationId: z.string() });

/** The visitor's message, as the messenger answers it. */
export const send = async (token: string, content: string, conversationId?: string) =>
  Sent.parse((await messenger.post('/messages', { content, conversationId }, token)).body);

export const write = async (token: string, content: string, conversationId?: string) =>
  (await send(token, content, conversationId)).conversationId;

export const ann = { email: 'ann@example.com', firstName: 'Ann' };

/**
 * An owner, a channel with `teammate`, its messenger with an identity secret, Ann's earlier
 * conversation, written signed in, and an anonymous visitor.
 */
export const setUp = async (orgId: string) => {
  const owner = clientAs(orgId);
  const teammate = clientAs(orgId, [PERMISSIONS.inboxView, PERMISSIONS.channelView], 'teammate');
  const channel = await owner.channels.create({ name: 'Support', memberIds: ['teammate'] });

  const integration = await owner.integrations.create({
    channelId: channel.id,
    kind: 'messenger',
    name: 'Website',
  });

  const { id } = integration;
  const key = integration.publicKey;
  const { identitySecret } = await owner.integrations.messenger.rotateSecret({ id });

  /** Ann as her website signs her in, or with a signature of `value`. */
  const signed = (value = ann.email) => ({
    ...ann,
    hash: createHmac('sha256', identitySecret).update(value).digest('hex'),
  });

  const hers = await write((await connect({ key, identity: signed() })).token, 'My order?');

  return {
    owner,
    teammate,
    id,
    key,
    identitySecret,
    signed,
    hers,
    token: (await connect({ key })).token,
    ownerOf: async (conversation: string) =>
      (await teammate.conversations.get({ id: conversation })).customerId,
  };
};
