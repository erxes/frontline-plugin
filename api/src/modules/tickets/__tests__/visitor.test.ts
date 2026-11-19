import { describe, expect, it, vi } from 'vite-plus/test';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import { serve } from '#/test/http.ts';
import { coreTicketFields } from '#/test/coreUnits.ts';
import { clientAs } from '#/test/member.ts';
import { tokenOf } from '../../messenger/session.ts';
import { subscribe } from '../../messenger/stream.ts';

// Core checks a new ticket's fields.
vi.mock('#/core.ts', async (importOriginal) =>
  (await import('#/test/coreUnits.ts')).unitsStandIn(await importOriginal()),
);

const messenger = serve('/api/public/messenger');

describe("a messenger visitor's tickets", () => {
  it('lets a messenger visitor file tickets in the pipelines it offers and follow only theirs', async () => {
    const owner = clientAs('org-tk-visitor');
    const channel = await owner.channels.create({ name: 'Support' });
    const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Main' });
    const statuses = await owner.pipelines.statuses.list({ pipelineId: pipeline.id });
    const elsewhere = await owner.channels.create({ name: 'Sales' });
    const foreign = await owner.pipelines.create({ channelId: elsewhere.id, name: 'Leads' });
    const tag = await owner.tags.create({ type: 'ticket', name: 'Shipping' });

    const integration = await owner.integrations.create({
      channelId: channel.id,
      kind: 'messenger',
      name: 'Website',
      config: { ticketPipelineIds: [pipeline.id, foreign.id] },
    });

    const visitor = { orgId: 'org-tk-visitor', integrationId: integration.id, verified: false };
    const ann = await tokenOf({ ...visitor, customerId: 'customer-ann', identified: true });
    const anonymous = await tokenOf({ ...visitor, customerId: 'customer-bob', identified: false });
    const file = { pipelineId: pipeline.id, name: 'Broken zip', tagIds: [tag.id] };

    // Only the pipeline of the messenger's own channel is offered.
    expect((await messenger.get('/tickets/forms', ann)).body).toMatchObject({
      pipelines: [{ id: pipeline.id, name: 'Main' }],
      tags: [{ id: tag.id, name: 'Shipping', colorCode: null }],
    });
    expect((await messenger.post('/tickets', file, anonymous)).status).toBe(403);
    expect(
      (await messenger.post('/tickets', { ...file, pipelineId: foreign.id }, ann)).status,
    ).toBe(400);

    // A field required on the new ticket form binds a member's ticket, not the visitor's.
    coreTicketFields.required = ['size'];

    await expect(owner.tickets.create({ pipelineId: pipeline.id, name: 'Late' })).rejects.toThrow(
      'Size is required',
    );

    const filed = await messenger.post('/tickets', file, ann);

    coreTicketFields.required = [];

    expect(filed).toMatchObject({ status: 201, body: { name: 'Broken zip', status: 'New' } });
    expect(await owner.tickets.list({})).toMatchObject({
      tickets: [{ customerId: 'customer-ann', createdBy: null, tagIds: [tag.id] }],
    });
    expect((await messenger.get('/tickets', ann)).body).toEqual([
      expect.objectContaining({ name: 'Broken zip', pipeline: 'Main' }),
    ]);
    expect((await messenger.get('/tickets', anonymous)).body).toEqual([]);

    // The team moving Ann's ticket on to Bob tells both their messengers' streams, so it leaves
    // her ticket tab and joins his.
    const heard: string[] = [];
    const id = (await owner.tickets.list({})).tickets[0]?.id ?? '';
    const resolved = statuses.find((status) => status.type === 4)?.id ?? '';

    const listen = (who: string) =>
      subscribe('org-tk-visitor', `customer-${who}`, (n) => heard.push(`${who} ${n.event}`));

    const stops = [await listen('ann'), await listen('bob')];

    await owner.tickets.update({ id, statusId: resolved, customerId: 'customer-bob' });
    await vi.waitFor(() => expect(heard.toSorted()).toEqual(['ann ticket', 'bob ticket']));

    for (const stop of stops) stop();
  });

  it("shows the visitor the comments the ticket's members write to them, and takes back one", async () => {
    const orgId = 'org-tk-comments';
    const owner = clientAs(orgId);
    const channel = await owner.channels.create({ name: 'Support', memberIds: ['teammate'] });
    const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Main' });
    const teammate = clientAs(orgId, [PERMISSIONS.channelView], 'teammate');
    const outsider = clientAs(orgId, [PERMISSIONS.channelView], 'outsider');

    const integration = await owner.integrations.create({
      channelId: channel.id,
      kind: 'messenger',
      name: 'Website',
      config: { ticketPipelineIds: [pipeline.id] },
    });

    const ann = await tokenOf({
      orgId,
      integrationId: integration.id,
      verified: false,
      customerId: 'customer-ann',
      identified: true,
    });

    const filed = await messenger.post('/tickets', { pipelineId: pipeline.id, name: 'Zip' }, ann);
    const ticketId = (await owner.tickets.list({})).tickets[0]?.id ?? '';

    expect(filed.body).toMatchObject({ comments: [] });

    const heard: string[] = [];
    const stop = await subscribe(orgId, 'customer-ann', (n) => heard.push(n.event));
    const comment = await teammate.tickets.addComment({ ticketId, body: 'Sent a new one today.' });

    await vi.waitFor(() => expect(heard).toEqual(['ticket']));
    stop();

    expect((await messenger.get('/tickets', ann)).body).toMatchObject([
      { comments: [{ id: comment.id, body: 'Sent a new one today.' }] },
    ]);
    await expect(owner.tickets.comments({ ticketId })).resolves.toMatchObject([
      { body: 'Sent a new one today.', createdBy: 'teammate', mine: false },
    ]);

    // Only the channel's members write on its tickets, and only the author takes one back.
    await expect(outsider.tickets.addComment({ ticketId, body: 'Hi' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(owner.tickets.removeComment({ id: comment.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    await expect(clientAs('org-tk-other').tickets.comments({ ticketId })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });

    await teammate.tickets.removeComment({ id: comment.id });

    expect((await messenger.get('/tickets', ann)).body).toEqual([
      expect.objectContaining({ comments: [] }),
    ]);
  });
  it('remembers the conversation a member made a ticket from, one they see', async () => {
    const orgId = 'org-tk-source';
    const owner = clientAs(orgId);
    const channel = await owner.channels.create({ name: 'Support', memberIds: ['clerk'] });
    const pipeline = await owner.pipelines.create({ channelId: channel.id, name: 'Main' });
    const sales = await owner.channels.create({ name: 'Sales', memberIds: ['teammate'] });
    const leads = await owner.pipelines.create({ channelId: sales.id, name: 'Leads' });
    const teammate = clientAs(orgId, [PERMISSIONS.channelView, PERMISSIONS.inboxView], 'teammate');
    // In the conversation's channel, but without the inbox.
    const clerk = clientAs(orgId, [PERMISSIONS.channelView], 'clerk');

    const integration = await owner.integrations.create({
      channelId: channel.id,
      kind: 'messenger',
      name: 'Website',
      config: {},
    });

    const ann = await tokenOf({
      orgId,
      integrationId: integration.id,
      verified: false,
      customerId: 'customer-ann',
      identified: true,
    });

    const { conversationId } = z
      .object({ conversationId: z.string() })
      .parse((await messenger.post('/messages', { content: 'My zip is broken' }, ann)).body);

    const ticket = await owner.tickets.create({
      pipelineId: pipeline.id,
      name: 'Broken zip',
      customerId: 'customer-ann',
      conversationId,
    });

    expect(ticket).toMatchObject({ conversationId, customerId: 'customer-ann' });
    await owner.tickets.create({ pipelineId: pipeline.id, name: 'Other' });

    const filter = JSON.stringify({
      match: 'all',
      rules: [{ path: 'subject.conversationId', op: 'eq', value: conversationId }],
    });

    await expect(owner.tickets.list({ filter })).resolves.toMatchObject({
      tickets: [{ id: ticket.id, conversationId }],
      totalCount: 1,
    });
    // A member outside the conversation's channel can't name it.
    await expect(
      teammate.tickets.create({ pipelineId: leads.id, name: 'Zip', conversationId }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(
      clerk.tickets.create({ pipelineId: pipeline.id, name: 'Zip', conversationId }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
