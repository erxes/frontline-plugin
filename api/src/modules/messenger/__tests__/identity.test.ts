import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import type * as Sdk from '@erxes/plugin-sdk';
import type * as CoreModule from '#/core.ts';
import { PERMISSIONS } from '#/core.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';

// Tests never reach core. Ann is a customer already, on the silver plan; another email or phone
// finds a new lead. Changes to customers and messages to core's agents are kept for the test to
// read.
const core = vi.hoisted(() => ({
  customers: 0,
  updates: [] as { id: string; primaryEmail?: string; customFields?: Record<string, unknown> }[],
  submitted: [] as Record<string, unknown>[],
}));

vi.mock('#/core.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof CoreModule>();

  return {
    ...actual,
    core: {
      ...actual.core,
      forOrg: () => ({
        customers: {
          create: async () => {
            core.customers += 1;

            return { id: `customer-${core.customers}` };
          },
          findOrCreate: async ({ primaryEmail }: { primaryEmail?: string }) =>
            primaryEmail === 'ann@example.com'
              ? { customer: { id: 'customer-ann' }, created: false }
              : { customer: { id: `lead-${primaryEmail}` }, created: true },
          get: async ({ id }: { id: string }) => ({
            id,
            customFields: id === 'customer-ann' ? { plan: 'silver' } : {},
          }),
          update: async (change: (typeof core.updates)[number]) => {
            core.updates.push(change);

            return { id: change.id };
          },
        },
        notifications: { create: async () => ({ ok: true }) },
        agents: {
          submit: async (input: Record<string, unknown>) => {
            core.submitted.push(input);

            return { ok: true };
          },
        },
      }),
    },
  };
});

// Core signs each event delivery; here the token `core-event` stands for its signature.
vi.mock('@erxes/plugin-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof Sdk>();

  return {
    ...actual,
    verifyCoreEvent: async (authorization: string | undefined, raw: string) => {
      if (authorization !== 'Bearer core-event') throw new Error('not signed by core');

      return actual.DeliveredEvent.parse(JSON.parse(raw));
    },
  };
});

const messenger = serve('/api/public/messenger');
const api = serve('/api');

const Connected = z.object({
  token: z.string(),
  identified: z.boolean(),
  conversations: z.array(z.looseObject({ id: z.string() })),
});

/** What `/connect` answers a visitor who sends `body`. */
const connect = async (body: Record<string, unknown>) =>
  Connected.parse((await messenger.post('/connect', body)).body);

const Sent = z.object({ id: z.string(), conversationId: z.string() });

/** The visitor's message, as the messenger answers it. */
const send = async (token: string, content: string, conversationId?: string) =>
  Sent.parse((await messenger.post('/messages', { content, conversationId }, token)).body);

const write = async (token: string, content: string, conversationId?: string) =>
  (await send(token, content, conversationId)).conversationId;

const ann = { email: 'ann@example.com', firstName: 'Ann' };

/**
 * An owner, a channel with `teammate`, its messenger with an identity secret, Ann's earlier
 * conversation, written signed in, and an anonymous visitor.
 */
const setUp = async (orgId: string) => {
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

describe('messenger identity', () => {
  it('shows the identity secret only to a member who may change the messenger', async () => {
    const { owner, teammate, id, identitySecret } = await setUp('org-mi-a');

    expect(await owner.integrations.messenger.settings({ id })).toMatchObject({ identitySecret });
    expect(await teammate.integrations.messenger.settings({ id })).toMatchObject({
      identitySecret: null,
    });
    await expect(teammate.integrations.messenger.rotateSecret({ id })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });

    const { identitySecret: rotated } = await owner.integrations.messenger.rotateSecret({ id });

    expect(rotated).not.toBe(identitySecret);
  });

  it('gives a stranger who types a known customer’s email nothing of theirs', async () => {
    const { owner, id, key, token, hers, signed, ownerOf } = await setUp('org-mi-b');
    const before = await write(token, 'Anonymous question');

    // A messenger that requires an email takes the typed one, on the visitor's own lead.
    await owner.integrations.update({ id, config: { requireAuth: true } });
    expect((await messenger.post('/messages', { content: 'Again' }, token)).status).toBe(403);

    const stranger = await connect({ key, token, identity: ann });
    const lead = await ownerOf(before);

    expect(stranger).toMatchObject({ identified: true, conversations: [{ id: before }] });
    expect(lead).not.toBe('customer-ann');
    expect(core.updates.at(-1)).toEqual({ id: lead, primaryEmail: ann.email, firstName: 'Ann' });
    expect(core.updates.map((change) => change.id)).not.toContain('customer-ann');
    expect(await write(stranger.token, 'Now with my email', before)).toBe(before);
    expect((await messenger.get(`/conversations/${hers}/messages`, stranger.token)).status).toBe(
      404,
    );

    // A signature of another value, or none the secret made, is refused.
    for (const identity of [signed('x@example.com'), { ...ann, hash: 'forged' }])
      expect((await messenger.post('/connect', { key, token, identity })).status).toBe(403);

    expect(
      (await messenger.post('/connect', { key, identity: { firstName: 'No contact' } })).status,
    ).toBe(400);
  });

  it('signs a visitor in as the customer the website names, until it stops', async () => {
    const { key, token, hers, signed, ownerOf } = await setUp('org-mi-c');
    const before = await write(token, 'Anonymous question');

    // Ann signs in on this browser, and her anonymous conversation joins hers.
    const verified = await connect({ key, token, identity: signed() });

    expect(verified.identified).toBe(true);
    expect(verified.conversations.map((row) => row.id).toSorted()).toEqual(
      [before, hers].toSorted(),
    );
    expect(await ownerOf(before)).toBe('customer-ann');
    expect(await write(verified.token, 'Signed in', before)).toBe(before);

    // Signed out, the page starts a new visitor with nothing of hers.
    expect((await connect({ key, token: verified.token })).conversations).toEqual([]);
  });

  it("fills only the signed-in customer's blank fields, since her hash sits in the page", async () => {
    const { key, signed } = await setUp('org-mi-d');

    core.updates.length = 0;
    await connect({ key, identity: signed(), customFields: { plan: 'free', city: 'Darkhan' } });

    expect(core.updates).toEqual([{ id: 'customer-ann', customFields: { city: 'Darkhan' } }]);

    // A visitor's own lead takes every value.
    core.updates.length = 0;
    await connect({ key, customFields: { plan: 'free' } });

    expect(core.updates).toEqual([
      { id: `customer-${core.customers}`, customFields: { plan: 'free' } },
    ]);
  });
});

/** Core delivers `core.agent.finished` with `agent-1`'s `answer` in the conversation `key`. */
const agentFinished = (orgId: string, eventId: string, key: string, answer: string) => {
  const at = new Date().toISOString();
  const type = 'core.agent.finished';
  const payload = { agentId: 'agent-1', plugin: 'frontline', key, answer, blocks: [] };

  const data = {
    id: eventId,
    source: 'core',
    type,
    version: 1,
    payload,
    summary: null,
    link: null,
  };

  const about = { subjectType: null, subjectId: null, entityType: null, entityId: null };
  const actor = { actorType: 'system', actorId: null };

  return api.post(
    '/events',
    {
      id: eventId,
      type,
      organizationId: orgId,
      createdAt: at,
      data: { ...data, ...about, ...actor, occurredAt: at, createdAt: at },
    },
    'core-event',
  );
};

const Page = z.object({
  items: z.array(z.object({ content: z.string(), fromVisitor: z.boolean() })),
});

/** The conversation's messages as its visitor reads them, oldest first. */
const visitorReads = async (token: string, id: string) =>
  Page.parse((await messenger.get(`/conversations/${id}/messages`, token)).body).items.toReversed();

/** The identity set-up, with its messenger answered by core's `agent-1`. */
const withAgent = async (orgId: string) => {
  const set = await setUp(orgId);

  await set.owner.integrations.messenger.setAgent({ id: set.id, agentId: 'agent-1' });

  return set;
};

describe("a messenger's core agent", () => {
  it('gets each visitor message keyed by its conversation, and a signed-in customer', async () => {
    const { owner, id, key, signed, hers, token } = await withAgent('org-id-agent-a');
    const stranger = await send(token, 'Do you ship to Darkhan?');
    const annToken = (await connect({ key, identity: signed() })).token;
    const fromAnn = await send(annToken, 'Where is my order?', hers);

    expect(core.submitted).toContainEqual({
      id: 'agent-1',
      key: stranger.conversationId,
      text: 'Do you ship to Darkhan?',
      requestId: stranger.id,
    });
    expect(core.submitted).toContainEqual({
      id: 'agent-1',
      key: hers,
      text: 'Where is my order?',
      requestId: fromAnn.id,
      customerId: 'customer-ann',
    });

    await owner.integrations.messenger.setAgent({ id, agentId: null });
    await send(token, 'Anyone there?', stranger.conversationId);

    expect(core.submitted.map(({ text }) => text)).not.toContain('Anyone there?');
  });

  it('posts its answer to the visitor as the bot, once', async () => {
    const { teammate, token } = await withAgent('org-id-agent-b');
    const id = await write(token, 'Do you ship daily?');

    expect((await agentFinished('org-id-agent-b', 'ev-b', id, 'We do.')).status).toBe(204);
    // Core may deliver an event again.
    await agentFinished('org-id-agent-b', 'ev-b', id, 'We do.');

    expect(await visitorReads(token, id)).toEqual([
      { content: 'Do you ship daily?', fromVisitor: true },
      { content: 'We do.', fromVisitor: false },
    ]);
    expect(await teammate.conversations.get({ id })).toMatchObject({
      operator: 'bot',
      content: 'We do.',
      customerRespondedLast: false,
    });
  });

  it('stops answering once a member replies', async () => {
    const { teammate, token } = await withAgent('org-id-agent-c');
    const id = await write(token, 'Hello?');

    await teammate.conversations.messages.create({ conversationId: id, content: 'I can help.' });

    expect(await teammate.conversations.get({ id })).toMatchObject({ operator: 'person' });

    await write(token, 'Thanks!', id);
    await agentFinished('org-id-agent-c', 'ev-c', id, 'Late answer');

    expect(core.submitted.map(({ text }) => text)).not.toContain('Thanks!');
    expect((await visitorReads(token, id)).map(({ content }) => content)).toEqual([
      'Hello?',
      'I can help.',
      'Thanks!',
    ]);
  });
});
