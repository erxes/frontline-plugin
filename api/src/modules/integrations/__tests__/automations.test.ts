import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { withOrg } from '#/db/client.ts';
import { clientAs } from '#/test/member.ts';
import {
  channelFor,
  fakeProviders,
  fixture,
  runQueued,
  serve,
  telegramApi,
  webhookOf,
} from './fakes.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

const { deliver, act, send } = serve();

const Link = z.object({
  url: z.url(),
  linkId: z.string(),
  formId: z.string(),
  expiresAt: z.iso.datetime(),
});

/** A Telegram bot in a channel of `orgId`, with one customer's conversation. */
const telegramConversation = async (orgId: string) => {
  const calls = fakeProviders(telegramApi);
  const owner = clientAs(orgId);
  const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });
  const { path, signed } = webhookOf(calls);

  await channelFor(orgId, 'telegram', account.id);
  await deliver(path, fixture('telegram-update.json'), signed);

  const { conversations } = await owner.conversations.list({});
  const [conversation] = conversations;

  if (!conversation) throw new Error('the update opened no conversation');

  return { owner, account, conversation, calls };
};

describe('automations', () => {
  it('starts from a Telegram message and replies in its chat once per step', async () => {
    const { owner, conversation, calls } = await telegramConversation('org-auto-a');

    const events = await withOrg('org-auto-a', (tx) =>
      tx.execute(
        sql`select type, subject_id, entity_id, payload->>'content' as content
            from core_events where type = 'frontline.telegram.message_received'`,
      ),
    );

    expect(events.rows).toEqual([
      {
        type: 'frontline.telegram.message_received',
        subject_id: conversation.customerId,
        entity_id: conversation.id,
        content: 'Hello, is my order on its way?',
      },
    ]);

    const step = {
      input: { message: 'It ships today.' },
      context: {
        event: {
          type: 'frontline.telegram.message_received',
          subjectType: 'customer',
          subjectId: conversation.customerId,
          entityType: 'frontline.conversation',
          entityId: conversation.id,
        },
        subject: { id: conversation.customerId },
      },
    };

    const first = await act('frontline.telegram.send_message', step, {
      orgId: 'org-auto-a',
      run: 'run-1',
    });

    expect(first).toMatchObject({
      status: 200,
      body: { conversationId: conversation.id, content: 'It ships today.' },
    });

    // Core retries a step with the same key: the reply is written and sent once.
    expect(
      await act('frontline.telegram.send_message', step, { orgId: 'org-auto-a', run: 'run-1' }),
    ).toEqual(first);

    await runQueued();

    expect(calls.filter((call) => call.url.pathname.endsWith('/sendMessage'))).toMatchObject([
      { body: { chat_id: '4242', text: 'It ships today.' } },
    ]);

    const { messages } = await owner.conversations.messages.list({
      conversationId: conversation.id,
    });

    expect(messages[0]).toMatchObject({
      content: 'It ships today.',
      userId: 'user-org-auto-a',
      deliveryStatus: 'sent',
    });
    expect(messages).toHaveLength(2);
  });

  it("files a ticket for the run's customer and conversation once per step", async () => {
    const { owner, conversation } = await telegramConversation('org-auto-t');
    const channel = await owner.channels.create({ name: 'Support', memberIds: [] });
    const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Main' });

    const step = {
      input: { pipelineId: pipeline.id, name: 'Order is late', priority: '3' },
      context: {
        event: {
          subjectType: 'customer',
          subjectId: conversation.customerId,
          payload: { conversationId: conversation.id },
        },
      },
    };

    const first = await act('frontline.ticket.create', step, { orgId: 'org-auto-t', run: 'run-t' });

    expect(first.status).toBe(200);
    expect(
      await act('frontline.ticket.create', step, { orgId: 'org-auto-t', run: 'run-t' }),
    ).toEqual(first);

    const { tickets } = await owner.tickets.list({});

    expect(tickets).toMatchObject([
      {
        name: 'Order is late',
        priority: 3,
        customerId: conversation.customerId,
        conversationId: conversation.id,
        pipelineId: pipeline.id,
      },
    ]);
    expect(first.body).toMatchObject({ ticketId: tickets[0]?.id, number: tickets[0]?.number });

    expect(
      await act(
        'frontline.ticket.create',
        { ...step, input: { ...step.input, pipelineId: 'missing' } },
        { orgId: 'org-auto-t', run: 'run-u' },
      ),
    ).toMatchObject({ status: 404 });
  });

  it("replies in the customer's latest conversation of the step's kind, or refuses", async () => {
    const { conversation } = await telegramConversation('org-auto-b');

    const bySubject = {
      input: { message: 'Hi again' },
      context: { subject: { id: conversation.customerId } },
    };

    expect(
      await act('frontline.telegram.send_message', bySubject, {
        orgId: 'org-auto-b',
        run: 'run-2',
      }),
    ).toMatchObject({ status: 200, body: { conversationId: conversation.id } });

    expect(
      await act('frontline.mail.send', bySubject, { orgId: 'org-auto-b', run: 'run-3' }),
    ).toMatchObject({ status: 422 });

    // Another organisation's step can't reach the conversation.
    expect(
      await act('frontline.telegram.send_message', bySubject, {
        orgId: 'org-auto-c',
        run: 'run-4',
      }),
    ).toMatchObject({ status: 422 });

    expect(
      await act('frontline.telegram.send_message', bySubject, {
        orgId: 'org-auto-b',
        run: 'run-5',
        token: 'forged',
      }),
    ).toMatchObject({ status: 401 });

    expect(
      await act('frontline.telegram.unknown', bySubject, { orgId: 'org-auto-b', run: 'run-6' }),
    ).toMatchObject({ status: 404 });

    expect(
      await act(
        'frontline.telegram.send_message',
        { input: {}, context: {} },
        {
          orgId: 'org-auto-b',
          run: 'run-7',
        },
      ),
    ).toMatchObject({ status: 400 });
  });

  it("shows a bot's webhook as Telegram sees it", async () => {
    const { owner, account } = await telegramConversation('org-auto-d');

    await expect(owner.integrations.telegram.webhookInfo({ id: account.id })).resolves.toEqual({
      url: 'https://frontline.example/api/public/webhooks/telegram/key',
      hasCustomCertificate: false,
      pendingUpdateCount: 3,
      ipAddress: null,
      lastErrorAt: new Date(1763180000 * 1000),
      lastErrorMessage: 'Wrong response from the webhook: 502 Bad Gateway',
      maxConnections: 40,
      allowedUpdates: ['message'],
    });

    await expect(
      clientAs('org-auto-e').integrations.telegram.webhookInfo({ id: account.id }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it("makes a form link that takes one answer, as the run's customer, about its record", async () => {
    const owner = clientAs('org-auto-link');
    const channel = await owner.channels.create({ name: 'Support' });
    const form = await owner.forms.create({ channelId: channel.id, name: 'Rating', title: 'Rate' });
    const field = await owner.forms.fields.add({ formId: form.id, type: 'text', label: 'Comment' });
    const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Main' });
    const ticket = await owner.tickets.create({ pipelineId: pipeline.id, name: 'Rated' });

    const step = {
      // Core leaves out the days the member left blank.
      input: { formId: form.id },
      context: {
        event: {
          subjectType: 'customer',
          subjectId: 'customer-rated',
          entityType: 'frontline.ticket',
          entityId: ticket.id,
        },
      },
    };

    const made = await act('frontline.form.create_link', step, {
      orgId: 'org-auto-link',
      run: 'run-link',
    });

    expect(made.status).toBe(200);

    const { url, linkId, expiresAt } = Link.parse(made.body);
    const days = (Date.parse(expiresAt) - Date.now()) / (24 * 60 * 60 * 1000);

    expect(Math.round(days)).toBe(30);
    const link = new URL(url);
    // The widgets app answers `/forms/<key>/<code>` through the API's public form route.
    const [, , key, code] = link.pathname.split('/');

    const answer = (token: string) =>
      send(`/public/${key}/forms/${code}`, {
        answers: { [field.id]: 'Quick and kind' },
        link: token,
      });

    expect(link.origin).toBe('https://widgets.e2e.test');
    expect(linkId).toBe('run-link:step-1');

    const token = link.searchParams.get('link') ?? '';

    expect(await answer(`${token}x`)).toBe(403);
    expect(await answer(token)).toBe(201);
    expect(await answer(token)).toBe(409);

    const { submissions } = await owner.forms.submissions.list({ formId: form.id });

    expect(submissions).toMatchObject([
      {
        customerId: 'customer-rated',
        referenceType: 'frontline.ticket',
        referenceId: ticket.id,
        linkId,
        answers: { [field.id]: 'Quick and kind' },
      },
    ]);

    // The ticket lists the answer sent about it.
    await expect(owner.tickets.responses({ id: ticket.id })).resolves.toMatchObject([
      { id: submissions[0]?.id, formName: 'Rating', customerId: 'customer-rated' },
    ]);

    // A form of another organisation makes no link.
    expect(
      (await act('frontline.form.create_link', step, { orgId: 'org-auto-other', run: 'run-x' }))
        .status,
    ).toBe(404);
  });
});
