import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { withOrg } from '#/db/client.ts';
import { takeBackWaiting } from '#/modules/inbox/agentTakeBack.ts';
import { asked } from './standIns.ts';
import { conversationWith, fakeProviders, graphApi, runQueued, serve } from './fakes.ts';
import { messagingWith, said } from './metaMessaging.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

const { connectMeta, deliver } = serve();
const messaging = messagingWith(deliver);

/** What frontline gave core's agent in conversation `key`. */
const agentGot = (key: string) => asked.submitted.filter((each) => each.key === key);

/** `orgId`'s page, answered by core's `agent-1`, and its integration. */
const withAgent = async (orgId: string) => {
  const { owner, integration } = await connectMeta(orgId, 'facebook');

  await owner.integrations.setAgent({ id: integration.id, agentId: 'agent-1' });

  return { owner, integration };
};

/** psid-1's conversation with `orgId`'s page, which a member answered, so a person has it. */
const answeredByMember = async (orgId: string) => {
  const { owner, integration } = await withAgent(orgId);

  await messaging('page', 'page-1', [said('psid-1', 'page-1', 'm_hi', { text: 'Hi' })]);

  const id = await conversationWith(orgId, 'psid-1');

  await owner.conversations.messages.create({ conversationId: id, content: 'I can help.' });
  await runQueued();

  return { owner, integration, id };
};

describe('the agent answers again', () => {
  it('answers at once, when a member hands the conversation back, what the customer wrote meanwhile', async () => {
    fakeProviders(graphApi);
    const { owner } = await withAgent('org-fb-agent-back');

    await messaging('page', 'page-1', [said('psid-1', 'page-1', 'm_hi', { text: 'Hi' })]);

    const id = await conversationWith('org-fb-agent-back', 'psid-1');
    const { customerId } = await owner.conversations.get({ id });

    // A member answers, which stops the agent; the customer writes twice more.
    await owner.conversations.messages.create({ conversationId: id, content: 'I can help.' });
    await runQueued();
    await messaging('page', 'page-1', [
      said('psid-1', 'page-1', 'm_where', { text: 'Where is my order?' }),
      said('psid-1', 'page-1', 'm_size', { text: 'Size M' }),
    ]);
    expect(agentGot(id)).toHaveLength(1);

    await owner.conversations.setOperator({ ids: [id], operator: 'bot' });

    const { messages } = await owner.conversations.messages.list({ conversationId: id });
    const last = messages.find((message) => message.externalId === 'm_size');

    // Both messages since the member's answer, in one, under a request id of their own.
    expect(agentGot(id).at(-1)).toEqual({
      id: 'agent-1',
      key: id,
      text: 'Where is my order?\nSize M',
      requestId: `resume:${last?.id}`,
      customerId,
    });

    // Already the bot's: nothing goes again.
    await owner.conversations.setOperator({ ids: [id], operator: 'bot' });
    expect(agentGot(id)).toHaveLength(2);
  });

  it('once the conversation is resolved, from the customer’s next message', async () => {
    fakeProviders(graphApi);
    const { owner, id } = await answeredByMember('org-fb-agent-resolved');

    await owner.conversations.setStatus({ ids: [id], status: 'resolved' });
    expect(await owner.conversations.get({ id })).toMatchObject({ operator: 'bot' });

    await messaging('page', 'page-1', [
      said('psid-1', 'page-1', 'm_new', { text: 'One more thing' }),
    ]);
    expect(agentGot(id).at(-1)).toMatchObject({ text: 'One more thing' });
  });

  it('once the customer waited on a person as long as the integration says', async () => {
    fakeProviders(graphApi);
    const { owner, integration, id } = await answeredByMember('org-fb-agent-late');

    expect(await owner.integrations.setAgent({ id: integration.id, takeBackMinutes: 60 })).toEqual({
      id: integration.id,
      agentId: 'agent-1',
      takeBackMinutes: 60,
    });

    await messaging('page', 'page-1', [said('psid-1', 'page-1', 'm_late', { text: 'Hello?' })]);

    // Not yet an hour.
    await takeBackWaiting('org-fb-agent-late');
    expect(await owner.conversations.get({ id })).toMatchObject({ operator: 'person' });

    await withOrg('org-fb-agent-late', (tx) =>
      tx.execute(sql`update frontline_conversations
        set waiting_since = now() - interval '61 minutes' where id = ${id}`),
    );
    await takeBackWaiting('org-fb-agent-late');

    expect(await owner.conversations.get({ id })).toMatchObject({ operator: 'bot' });

    const { messages } = await owner.conversations.messages.list({ conversationId: id });
    const late = messages.find((message) => message.externalId === 'm_late');

    expect(agentGot(id).at(-1)).toMatchObject({ text: 'Hello?', requestId: `resume:${late?.id}` });
  });
});
