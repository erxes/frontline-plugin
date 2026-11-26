import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import {
  channelFor,
  fakeProviders,
  fixture,
  runQueued,
  serve as serveWebhooks,
  telegramApi,
  webhookOf,
} from '#/modules/integrations/__tests__/fakes.ts';
import { serve } from '#/test/http.ts';
import { clientAs } from '#/test/member.ts';
import { checkReplies } from '../replyCheck.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('#/modules/integrations/__tests__/standIns.ts')).coreStandIn(
    await importOriginal(),
  ),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('#/modules/integrations/__tests__/standIns.ts')).sdkStandIn(await importOriginal()),
);

const messenger = serve('/api/public/messenger');
const { deliver } = serveWebhooks();

const agent = [PERMISSIONS.inboxView, PERMISSIONS.channelView];

const Connected = z.looseObject({ token: z.string() });

/**
 * An owner (the channel's admin), `ann` and `bob` in a channel with a messenger and `replyPolicy`,
 * and `write`, which starts a conversation as a new visitor, or writes in the visitor's
 * conversation it names.
 */
const setUp = async (orgId: string, replyPolicy: Record<string, unknown>) => {
  const owner = clientAs(orgId);
  const channel = await owner.channels.create({ name: 'Support', memberIds: ['ann', 'bob'] });

  await owner.channels.setReplyPolicy({ id: channel.id, replyPolicy });

  const integration = await owner.integrations.create({
    channelId: channel.id,
    kind: 'messenger',
    name: 'Website',
  });

  const write = async (content: string, into?: { token: string; conversationId: string }) => {
    const token =
      into?.token ??
      Connected.parse((await messenger.post('/connect', { key: integration.publicKey })).body)
        .token;

    await messenger.post('/messages', { content, conversationId: into?.conversationId }, token);

    return token;
  };

  return {
    owner,
    ann: clientAs(orgId, agent, 'ann'),
    bob: clientAs(orgId, agent, 'bob'),
    channel,
    write,
  };
};

/** Runs `change` on the organisation's conversations, to move their clocks back. */
const travel = (orgId: string, change: ReturnType<typeof sql>) =>
  withOrg(orgId, (tx) => tx.execute(sql`update frontline_conversations set ${change}`));

const eventsOf = (orgId: string, type: string) =>
  withOrg(orgId, async (tx) =>
    tx.execute<{
      entity_id: string;
      payload: Record<string, unknown>;
      notify: { userIds: string[]; title: string } | null;
    }>(
      sql`select entity_id, payload, notify from core_events
        where org_id = ${orgId} and type = ${type} order by seq`,
    ),
  );

describe('reply rules', () => {
  it('starts the clock when the customer writes and stops it on the reply, keeping how long they waited', async () => {
    const { owner, ann, write } = await setUp('org-rr-a', {
      firstReplyMinutes: 30,
      nextReplyMinutes: 10,
    });

    const token = await write('Where is my order?');
    const [waiting] = (await ann.conversations.list({})).conversations;
    const id = waiting?.id ?? '';
    const visitor = { token, conversationId: id };

    expect(waiting?.waitingSince).toBeInstanceOf(Date);
    expect((waiting?.replyDueAt?.getTime() ?? 0) - (waiting?.waitingSince?.getTime() ?? 0)).toBe(
      30 * 60_000,
    );

    // A second message keeps the customer's place in the queue.
    await write('Hello?', visitor);
    expect((await ann.conversations.get({ id })).waitingSince).toEqual(waiting?.waitingSince);

    await travel('org-rr-a', sql`waiting_since = now() - interval '5 minutes'`);

    const reply = await ann.conversations.messages.create({ conversationId: id, content: 'Today' });

    expect(reply.waitedSeconds).toBeGreaterThanOrEqual(300);
    expect(reply.replyOnTime).toBe(true);
    expect(await ann.conversations.get({ id })).toMatchObject({
      waitingSince: null,
      replyDueAt: null,
    });

    // A note answers nobody; the next message waits on the next reply target.
    await ann.conversations.messages.create({ conversationId: id, content: 'fyi', internal: true });
    await write('Thanks, and the invoice?', visitor);

    const again = await ann.conversations.get({ id });

    expect((again.replyDueAt?.getTime() ?? 0) - (again.waitingSince?.getTime() ?? 0)).toBe(
      10 * 60_000,
    );

    // Resolving keeps nobody waiting.
    await owner.conversations.setStatus({ ids: [id], status: 'resolved' });
    expect(await ann.conversations.get({ id })).toMatchObject({
      waitingSince: null,
      replyDueAt: null,
    });

    const report = await owner.reports.conversations({
      from: new Date(Date.now() - 86_400_000),
      to: new Date(Date.now() + 60_000),
      timeZone: 'UTC',
    });

    expect(report.replies).toEqual({ withTarget: 1, onTime: 1 });
    expect(report.replySeconds).toBeGreaterThanOrEqual(300);
    expect(report.members).toEqual([
      expect.objectContaining({ userId: 'ann', replies: 1, replySeconds: report.replySeconds }),
    ]);
  });

  it('warns before a reply is due and once it is overdue, telling who owes it', async () => {
    const { owner, ann, bob, write } = await setUp('org-rr-b', {
      firstReplyMinutes: 60,
      warnBeforeMinutes: 15,
    });

    await write('Can I return this?');
    await bob.availability.set({ status: 'away' });

    await expect(checkReplies('org-rr-b')).resolves.toMatchObject({ warned: 0, breached: 0 });

    await travel('org-rr-b', sql`reply_due_at = now() + interval '10 minutes'`);
    await expect(checkReplies('org-rr-b')).resolves.toMatchObject({ warned: 1, breached: 0 });
    await expect(checkReplies('org-rr-b')).resolves.toMatchObject({ warned: 0, breached: 0 });

    // Unassigned, it is the channel's available members who owe it.
    const [warning] = (await eventsOf('org-rr-b', 'frontline.conversation.reply_due_soon')).rows;

    expect(warning?.notify?.userIds.toSorted()).toEqual(['ann', 'user-org-rr-b']);

    const [conversation] = (await ann.conversations.list({})).conversations;
    const id = conversation?.id ?? '';

    await owner.conversations.assign({ ids: [id], assigneeId: 'ann' });
    await travel('org-rr-b', sql`reply_due_at = now() - interval '1 minute'`);
    await expect(checkReplies('org-rr-b')).resolves.toMatchObject({ warned: 0, breached: 1 });

    // Overdue, the assignee hears, and so do the channel's admins.
    const [breach] = (await eventsOf('org-rr-b', 'frontline.conversation.reply_overdue')).rows;

    expect(breach?.notify?.userIds.toSorted()).toEqual(['ann', 'user-org-rr-b']);
    expect(breach?.payload).toMatchObject({ conversationId: id, assigneeId: 'ann' });

    const overdue = JSON.stringify({
      match: 'all',
      rules: [{ path: 'subject.replyOverdue', op: 'eq', value: true }],
    });

    expect((await ann.conversations.counts({})).overdue).toBe(1);
    expect((await ann.conversations.list({ filter: overdue })).totalCount).toBe(1);

    await ann.conversations.messages.create({ conversationId: id, content: 'Yes, within 30 days' });

    expect((await ann.conversations.counts({})).overdue).toBe(0);
    expect((await ann.conversations.list({ filter: overdue })).totalCount).toBe(0);
  });

  it('assigns waiting conversations to the available member with the fewest open ones, up to the cap', async () => {
    const { owner, ann, bob, write } = await setUp('org-rr-c', {
      autoAssign: true,
      maxOpenPerMember: 1,
    });

    await owner.availability.set({ status: 'away' });
    await bob.availability.set({ status: 'away' });
    expect(await bob.availability.mine({})).toEqual({ status: 'away' });
    expect((await ann.availability.away({})).userIds.toSorted()).toEqual(['bob', 'user-org-rr-c']);

    await write('First');
    await write('Second');

    const assignees = async () =>
      (await owner.conversations.list({})).conversations
        .map((conversation) => [conversation.content, conversation.assigneeId])
        .toSorted(([left], [right]) => String(left).localeCompare(String(right)));

    // Ann takes one; she is at her cap, and everyone else is away.
    expect(await assignees()).toEqual([
      ['First', 'ann'],
      ['Second', null],
    ]);

    // Coming back picks the waiting one up at once.
    await bob.availability.set({ status: 'available' });
    expect(await assignees()).toEqual([
      ['First', 'ann'],
      ['Second', 'bob'],
    ]);

    const assigned = (await eventsOf('org-rr-c', 'frontline.conversation.assigned')).rows;

    expect(
      assigned.map((row) => [row.payload.reason, row.payload.to, row.notify?.userIds]),
    ).toEqual([
      ['auto', 'ann', ['ann']],
      ['auto', 'bob', ['bob']],
    ]);
  });

  it('reassigns a conversation its assignee left unanswered to the next available member', async () => {
    const { owner, ann, bob, write } = await setUp('org-rr-d', { reassignAfterMinutes: 15 });

    await owner.availability.set({ status: 'away' });
    await write('Is anyone there?');

    const [conversation] = (await owner.conversations.list({})).conversations;
    const id = conversation?.id ?? '';

    await owner.conversations.assign({ ids: [id], assigneeId: 'ann' });
    await expect(checkReplies('org-rr-d')).resolves.toMatchObject({ reassigned: 0 });

    await travel(
      'org-rr-d',
      sql`waiting_since = now() - interval '20 minutes', assigned_at = now() - interval '16 minutes'`,
    );
    await expect(checkReplies('org-rr-d')).resolves.toMatchObject({ reassigned: 1 });
    expect((await bob.conversations.get({ id })).assigneeId).toBe('bob');
    // Bob's time counts from when he got it.
    await expect(checkReplies('org-rr-d')).resolves.toMatchObject({ reassigned: 0 });

    // With nobody else available, it stays with him.
    await ann.availability.set({ status: 'away' });
    await travel('org-rr-d', sql`assigned_at = now() - interval '16 minutes'`);
    await expect(checkReplies('org-rr-d')).resolves.toMatchObject({ reassigned: 0 });
    expect((await bob.conversations.get({ id })).assigneeId).toBe('bob');

    const [moved] = (await eventsOf('org-rr-d', 'frontline.conversation.assigned')).rows.filter(
      (row) => row.payload.reason === 'unanswered',
    );

    expect(moved).toMatchObject({
      payload: { from: 'ann', to: 'bob', afterMinutes: 15 },
      notify: { userIds: ['bob'] },
    });
  });

  it('answers a Telegram customer with the away message while every member is away, once', async () => {
    const calls = fakeProviders(telegramApi);
    const owner = clientAs('org-rr-e');
    const account = await owner.integrations.telegram.connect({ token: '777:good-token-abc' });
    const { path, signed } = webhookOf(calls);
    const integration = await channelFor('org-rr-e', 'telegram', account.id);

    await owner.channels.setReplyPolicy({
      id: integration.channelId,
      replyPolicy: { awayMessage: 'We are away until 9:00. We will answer then.' },
    });
    await owner.availability.set({ status: 'away' });

    expect(await deliver(path, fixture('telegram-update.json'), signed)).toBe(200);
    await runQueued();
    await runQueued();

    const [conversation] = (await owner.conversations.list({})).conversations;

    const { messages } = await owner.conversations.messages.list({
      conversationId: conversation?.id ?? '',
    });

    expect(
      messages.map((message) => [message.content, message.userId, message.customerId]),
    ).toEqual(
      expect.arrayContaining([['We are away until 9:00. We will answer then.', null, null]]),
    );
    expect(calls.filter((call) => call.url.pathname.endsWith('/sendMessage')).at(-1)?.body).toEqual(
      expect.objectContaining({ text: 'We are away until 9:00. We will answer then.' }),
    );
    // The away message doesn't answer the customer: they still wait for a person.
    expect(conversation?.waitingSince).toBeInstanceOf(Date);
  });

  it('lets only the channel admins set its reply rules', async () => {
    const { ann, channel } = await setUp('org-rr-f', {});

    await expect(
      ann.channels.setReplyPolicy({ id: channel.id, replyPolicy: { firstReplyMinutes: 5 } }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect((await ann.channels.get({ id: channel.id })).replyPolicy).toEqual({ autoAssign: false });
  });
});
