import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { JOBS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { asked } from './standIns.ts';
import {
  conversationWith,
  fakeProviders,
  fixture,
  graphApi,
  lastPost,
  runJob,
  runQueued,
  serve,
  signedByMeta,
} from './fakes.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

const { connectMeta, deliver } = serve();

/** `orgId`'s page with the chat Messenger delivered, and that chat's id. */
const chatting = async (orgId: string) => {
  const { owner } = await connectMeta(orgId, 'facebook');
  const raw = fixture('meta-delivery.json');

  await deliver('/meta', raw, signedByMeta(raw));
  // The delivery's files are copied off Meta's CDN, so only a reply's jobs wait after this.
  await runQueued();

  return { owner, conversationId: await conversationWith(orgId, 'psid-1') };
};

describe('messenger replies', () => {
  it('replies after Messenger’s 24 hours as a person', async () => {
    const calls = fakeProviders(graphApi);
    const { owner, conversationId } = await chatting('org-fb-b');

    await withOrg('org-fb-b', (tx) =>
      tx.execute(sql`update frontline_messages set created_at = now() - interval '2 days'`),
    );
    const late = { messaging_type: 'MESSAGE_TAG', tag: 'HUMAN_AGENT' };

    await owner.conversations.messages.create({ conversationId, content: 'Sorry for the wait' });
    await runQueued();
    expect(lastPost(calls)?.body).toMatchObject(late);

    // The window runs from the customer's message, not from the team's last reply.
    await owner.conversations.messages.create({ conversationId, content: 'It ships today' });
    await runQueued();
    expect(lastPost(calls)?.body).toMatchObject(late);
  });

  it('sends a reply and its files once, however often its job runs', async () => {
    let refuse = true;

    // Meta refuses the second file once, after taking the text and the first file.
    const calls = fakeProviders((call) => {
      if (refuse && JSON.stringify(call.body).includes('b.pdf')) {
        refuse = false;

        return Response.json({ error: { message: 'Try again later' } }, { status: 503 });
      }

      return graphApi(call);
    });

    const { owner, conversationId } = await chatting('org-fb-send');

    const reply = await owner.conversations.messages.create({
      conversationId,
      content: 'Both invoices',
      attachments: ['a', 'b'].map((id) => ({
        url: `/core/v1/files/file-${id}/download`,
        name: `${id}.pdf`,
      })),
    });

    const [queued] = asked.jobs.splice(0);
    const job = { orgId: 'org-fb-send', name: JOBS.send.name, payload: { messageId: reply.id } };
    const attempt = (count: number) => runJob(job, count);

    const sent = () =>
      calls.filter((call) => call.method === 'POST' && call.url.pathname.endsWith('me/messages'));

    const statusOf = async () =>
      (await owner.conversations.messages.list({ conversationId })).messages.find(
        (message) => message.id === reply.id,
      )?.deliveryStatus;

    expect(queued).toMatchObject({ payload: { messageId: reply.id } });
    await expect(attempt(1)).rejects.toThrow(/Try again later/);
    expect(await statusOf()).toBe('queued');

    // The next attempt sends only the refused file, and a repeat of the job sends nothing.
    await attempt(2);
    await attempt(2);
    expect(await statusOf()).toBe('sent');
    expect(sent().map((call) => JSON.stringify(call.body))).toEqual([
      expect.stringContaining('Both invoices'),
      expect.stringContaining('a.pdf'),
      expect.stringContaining('b.pdf'),
      expect.stringContaining('b.pdf'),
    ]);

    // An attempt that finds the reply claimed and never settled can't know whether it went: a
    // member decides, with Send again.
    await withOrg('org-fb-send', (tx) =>
      tx.execute(sql`update frontline_messages set delivery_status = 'sending'
        where id = ${reply.id}`),
    );
    await attempt(3);
    expect(await statusOf()).toBe('failed');
    expect(sent()).toHaveLength(4);
  });

  it('fails a reply whose send never ran within 15 minutes, and sends it again on request', async () => {
    const calls = fakeProviders(graphApi);
    const { owner, conversationId } = await chatting('org-fb-stuck');
    const reply = await owner.conversations.messages.create({ conversationId, content: 'Hello?' });

    const statusOf = async () =>
      (await owner.conversations.messages.list({ conversationId })).messages.find(
        (message) => message.id === reply.id,
      )?.deliveryStatus;

    const sent = () =>
      calls.filter((call) => call.method === 'POST' && call.url.pathname.endsWith('me/messages'))
        .length;

    const before = sent();

    expect(await statusOf()).toBe('queued');

    // Core never ran the job.
    await withOrg('org-fb-stuck', (tx) =>
      tx.execute(sql`update frontline_messages set queued_at = now() - interval '16 minutes'
        where id = ${reply.id}`),
    );
    expect(await statusOf()).toBe('failed');

    // The job, run after the member saw the reply fail, sends nothing.
    await runQueued();
    expect(sent()).toBe(before);
    expect(await statusOf()).toBe('failed');

    await expect(owner.conversations.messages.retry({ id: reply.id })).resolves.toMatchObject({
      deliveryStatus: 'queued',
    });
    await runQueued();
    expect(await statusOf()).toBe('sent');
    expect(sent()).toBe(before + 1);
  });
});
