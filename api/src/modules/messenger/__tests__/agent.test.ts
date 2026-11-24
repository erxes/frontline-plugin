import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { core } from './standIns.ts';
import { api, connect, messenger, Sent, send, setUp, write } from './visitors.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

/** Core delivers its event `type` about `agent-1`'s conversation `key`, with the rest of `payload`. */
const agentEvent = (
  orgId: string,
  eventId: string,
  type: string,
  key: string,
  rest: Record<string, unknown>,
) => {
  const at = new Date().toISOString();
  const payload = { agentId: 'agent-1', plugin: 'frontline', key, ...rest };

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

/** `agent-1`'s `answer`, and the `blocks` it showed below it, in the conversation `key`. */
const agentFinished = (
  orgId: string,
  eventId: string,
  key: string,
  answer: string,
  blocks: Record<string, unknown>[] = [],
) => agentEvent(orgId, eventId, 'core.agent.finished', key, { answer, blocks });

const Page = z.object({
  items: z.array(
    z.object({
      content: z.string(),
      fromVisitor: z.boolean(),
      blocks: z.array(z.record(z.string(), z.unknown())),
    }),
  ),
});

/** A product card and a payment link, as core sends them. */
const blocks = [
  {
    kind: 'product',
    title: 'Felt boots',
    price: '450,000₮',
    text: 'Handmade in Arkhangai.',
    imageUrl: 'https://shop.example.com/boots.jpg',
    url: 'https://shop.example.com/boots',
  },
  { kind: 'payment', title: 'Pay', url: 'https://pay.example.com/i/1', amount: '450,000₮' },
];

/** The conversation's messages as its visitor reads them, oldest first. */
const visitorReads = async (token: string, id: string) =>
  Page.parse((await messenger.get(`/conversations/${id}/messages`, token)).body).items.toReversed();

/** The identity set-up, with its messenger answered by core's `agent-1`. */
const withAgent = async (orgId: string) => {
  const set = await setUp(orgId);

  await set.owner.integrations.setAgent({ id: set.id, agentId: 'agent-1' });

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

    await owner.integrations.setAgent({ id, agentId: null });
    await send(token, 'Anyone there?', stranger.conversationId);

    expect(core.submitted.map(({ text }) => text)).not.toContain('Anyone there?');
  });

  it('posts its answer to the visitor as the bot, once, with what it showed', async () => {
    const { teammate, token } = await withAgent('org-id-agent-b');
    const id = await write(token, 'Do you ship daily?');
    // A newer core may show a kind this build can't draw; it is left out.
    const shown = [...blocks, { kind: 'booking', bookingId: 'b-1' }];

    expect((await agentFinished('org-id-agent-b', 'ev-b', id, 'We do.', shown)).status).toBe(204);
    // Core may deliver an event again.
    await agentFinished('org-id-agent-b', 'ev-b', id, 'We do.', shown);

    expect(await visitorReads(token, id)).toEqual([
      { content: 'Do you ship daily?', fromVisitor: true, blocks: [] },
      { content: 'We do.', fromVisitor: false, blocks },
    ]);
    expect(
      (await teammate.conversations.messages.list({ conversationId: id })).messages.map(
        (message) => message.blocks,
      ),
    ).toEqual([blocks, []]);
    expect(await teammate.conversations.get({ id })).toMatchObject({
      operator: 'bot',
      content: 'We do.',
      customerRespondedLast: false,
    });
  });

  it('hands the conversation to a person when core refuses the message', async () => {
    const { teammate, token } = await withAgent('org-id-agent-d');
    const id = await write(token, core.refused);

    await expect
      .poll(async () => (await teammate.conversations.get({ id })).operator)
      .toBe('person');
  });

  it('hands the conversation to a person once, with a note to the team why, when it hands off', async () => {
    const { teammate, token } = await withAgent('org-id-agent-e');
    const id = await write(token, 'I want my money back');
    const why = 'The customer asks for a refund';

    // Core sends the agent's line to the customer as its answer, then the hand-off.
    await agentFinished('org-id-agent-e', 'ev-e1', id, 'A person will answer you shortly.');

    const handedOff = () =>
      agentEvent('org-id-agent-e', 'ev-e2', 'core.agent.handed_off', id, { reason: why });

    expect((await handedOff()).status).toBe(204);
    // Core may deliver an event again.
    await handedOff();

    expect(await teammate.conversations.get({ id })).toMatchObject({ operator: 'person' });
    expect(
      (await teammate.conversations.messages.list({ conversationId: id })).messages.map(
        ({ content, internal }) => ({ content, internal }),
      ),
    ).toEqual([
      { content: `The agent handed this conversation to a person: ${why}`, internal: true },
      { content: 'A person will answer you shortly.', internal: false },
      { content: 'I want my money back', internal: false },
    ]);
    // The customer reads the agent's line, and no second hand-off message.
    expect((await visitorReads(token, id)).map(({ content }) => content)).toEqual([
      'I want my money back',
      'A person will answer you shortly.',
    ]);

    await send(token, 'Hello?', id);
    expect(core.submitted.map(({ text }) => text)).not.toContain('Hello?');
  });

  it("shows a member the agent's runs in a conversation, and restarts it", async () => {
    const { owner, teammate, id: integrationId, hers, token } = await withAgent('org-id-agent-f');
    const id = await write(token, 'Do you ship?');

    await send(token, 'To Darkhan?', id);

    const { agentId, runs } = await teammate.conversations.agentRuns({ id });

    expect(agentId).toBe('agent-1');
    expect(runs.map(({ text }) => text)).toEqual(['To Darkhan?', 'Do you ship?']);
    expect(runs[0]?.calls).toEqual([
      expect.objectContaining({ procedure: 'orders.list', ok: false, status: 403 }),
    ]);
    expect(await teammate.conversations.restartAgent({ id })).toEqual({ ok: true });
    expect(core.restarted).toContainEqual({ id: 'agent-1', key: id });

    // Ann wrote before the messenger had its agent, so it never ran there: no runs, no restart.
    expect((await teammate.conversations.agentRuns({ id: hers })).runs).toEqual([]);
    await expect(teammate.conversations.restartAgent({ id: hers })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });

    // Without an agent on the messenger, there is none to ask.
    await owner.integrations.setAgent({ id: integrationId, agentId: null });
    await expect(teammate.conversations.agentRuns({ id })).rejects.toMatchObject({
      code: 'BAD_REQUEST',
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

const faq = [{ id: 'ship', question: 'Do you ship to Darkhan?', answer: 'Yes, in two days.' }];

/** The agent set-up, with the messenger's one common question. */
const withFaq = async (orgId: string) => {
  const set = await withAgent(orgId);

  await set.owner.integrations.update({ id: set.id, config: { faq } });

  return set;
};

/** What core's agent was given in conversation `key`. */
const agentGot = (key: string) => core.submitted.filter((each) => each.key === key);

describe("a messenger's common questions", () => {
  it('answers a tapped one as the bot at once, in the open conversation, without the agent', async () => {
    const { teammate, token } = await withFaq('org-id-faq-a');
    const tapped = Sent.parse((await messenger.post('/faq/ship', {}, token)).body);
    const id = tapped.conversationId;

    expect(await visitorReads(token, id)).toEqual([
      { content: 'Do you ship to Darkhan?', fromVisitor: true, blocks: [] },
      { content: 'Yes, in two days.', fromVisitor: false, blocks: [] },
    ]);
    expect(await teammate.conversations.get({ id })).toMatchObject({
      operator: 'bot',
      content: 'Yes, in two days.',
    });
    expect(agentGot(id)).toEqual([]);

    // A second tap continues that conversation; an entry the messenger lacks is refused.
    expect(Sent.parse((await messenger.post('/faq/ship', {}, token)).body).conversationId).toBe(id);
    expect((await messenger.post('/faq/nope', {}, token)).status).toBe(404);

    // A typed message goes to the agent as before.
    await send(token, 'And to Erdenet?', id);
    expect(agentGot(id).map(({ text }) => text)).toEqual(['And to Erdenet?']);
  });

  it('answers a typed message that asks one exactly, and nothing near it', async () => {
    const { token } = await withFaq('org-id-faq-b');
    const id = await write(token, '  do you SHIP to darkhan ?! ');

    await send(token, 'Do you ship to Darkhan today?', id);

    expect(await visitorReads(token, id)).toEqual([
      { content: 'do you SHIP to darkhan ?!', fromVisitor: true, blocks: [] },
      { content: 'Yes, in two days.', fromVisitor: false, blocks: [] },
      { content: 'Do you ship to Darkhan today?', fromVisitor: true, blocks: [] },
    ]);
    expect(agentGot(id).map(({ text }) => text)).toEqual(['Do you ship to Darkhan today?']);
  });
});
