import { sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vite-plus/test';
import { JOBS, SEND_ATTEMPTS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { JOB_RUNS } from '#/jobs.ts';
import { clientAs } from '#/test/member.ts';
import { channelFor, fixture, runJob, runQueued } from './fakes.ts';
import { asked } from './standIns.ts';

vi.mock('#/core.ts', async (importOriginal) =>
  (await import('./standIns.ts')).coreStandIn(await importOriginal()),
);

vi.mock('@erxes/plugin-sdk', async (importOriginal) =>
  (await import('./standIns.ts')).sdkStandIn(await importOriginal()),
);

/** The mailbox's INBOX, which IMAP reads, and what went out over SMTP. */
const mailbox = vi.hoisted(() => ({
  inbox: [] as string[],
  sent: [] as { to: string; subject: string; messageId?: string; inReplyTo?: string }[],
}));

vi.mock('imapflow', () => ({
  ImapFlow: class {
    get mailbox() {
      return { uidValidity: 1n, uidNext: mailbox.inbox.length + 1 };
    }

    async connect() {}

    async logout() {}

    async getMailboxLock() {
      return { release: () => undefined };
    }

    async *fetch(range: string) {
      const from = Number(range.split(':')[0]);

      for (const [index, source] of mailbox.inbox.entries())
        if (index + 1 >= from) yield { uid: index + 1, source: Buffer.from(source) };
    }
  },
}));

vi.mock('nodemailer', () => ({
  createTransport: () => ({
    verify: async () => true,
    sendMail: async (mail: (typeof mailbox.sent)[number]) => {
      mailbox.sent.push(mail);

      return { messageId: mail.messageId ?? `<reply-${mailbox.sent.length}@shop.mn>` };
    },
  }),
}));

const server = { host: 'mail.shop.mn', port: 993, secure: true, user: 'support@shop.mn' };

/** A channel of `orgId` reading the mailbox support@shop.mn: its mail integration. */
const mailChannel = async (orgId: string) => {
  const account = await clientAs(orgId).integrations.mail.connect({
    address: 'support@shop.mn',
    name: 'Shop support',
    imap: { ...server, password: 'imap-secret' },
    smtp: { ...server, port: 465, password: 'smtp-secret' },
  });

  return channelFor(orgId, 'mail', account.id);
};

const sync = (orgId: string) => runJob({ orgId, name: JOBS.mailSync.name, payload: {} });

const replyTo = (root: string) =>
  [
    'From: Saraa <saraa@example.mn>',
    'To: support@shop.mn',
    'Subject: Re: Your refund',
    'Message-ID: <saraa-2@example.mn>',
    `In-Reply-To: ${root}`,
    `References: ${root}`,
    '',
    'Thank you, it arrived.',
  ].join('\r\n');

describe('mail', () => {
  it('writes a new mail that opens a conversation the reply joins, and starts automations', async () => {
    mailbox.inbox.length = 0;

    const owner = clientAs('org-mail-a');
    const integration = await mailChannel('org-mail-a');

    const { conversationId } = await owner.integrations.mail.compose({
      integrationId: integration.id,
      to: 'Saraa@Example.mn',
      subject: 'Your refund',
      content: 'We sent the refund today.',
    });

    await runQueued();

    const [sent] = mailbox.sent.splice(0);

    expect(sent).toMatchObject({ to: 'saraa@example.mn', subject: 'Your refund' });
    expect(sent?.messageId).toMatch(/^<[\w-]+@shop\.mn>$/);

    mailbox.inbox.push(replyTo(sent?.messageId ?? ''));
    await sync('org-mail-a');

    const { conversations } = await owner.conversations.list({});

    expect(conversations).toHaveLength(1);
    expect(conversations[0]).toMatchObject({
      id: conversationId,
      messageCount: 2,
      // Core's customer with that email, found rather than made again.
      customerId: 'customer-saraa@example.mn',
    });

    const { messages } = await owner.conversations.messages.list({ conversationId });

    expect(messages.map(({ content, deliveryStatus }) => ({ content, deliveryStatus }))).toEqual([
      { content: 'Thank you, it arrived.', deliveryStatus: null },
      { content: 'We sent the refund today.', deliveryStatus: 'sent' },
    ]);

    // The member's next mail answers the customer's, in the same thread.
    await owner.conversations.messages.create({ conversationId, content: 'Glad to hear it.' });
    await runQueued();

    expect(mailbox.sent.splice(0)).toMatchObject([
      { to: 'saraa@example.mn', subject: 'Re: Your refund', inReplyTo: '<saraa-2@example.mn>' },
    ]);

    const events = await withOrg('org-mail-a', (tx) =>
      tx.execute(
        sql`select type, entity_id, summary from core_events where type = 'frontline.mail.received'`,
      ),
    );

    expect(events.rows).toEqual([
      { type: 'frontline.mail.received', entity_id: conversationId, summary: null },
    ]);
  });

  it('stops mailing an address that bounced until a member lets it through', async () => {
    mailbox.inbox.length = 0;

    const owner = clientAs('org-mail-b');
    const integration = await mailChannel('org-mail-b');
    const mail = { integrationId: integration.id, subject: 'Order', content: 'Shipped.' };

    const { messageId, conversationId } = await owner.integrations.mail.compose({
      ...mail,
      to: 'gone@example.mn',
    });

    // The report arrives before the queued mail goes out: it is held, and fails on its last try.
    mailbox.inbox.push(fixture('mail-bounce.eml'));
    await sync('org-mail-b');

    const [queued] = asked.jobs.splice(0);

    const job = {
      orgId: 'org-mail-b',
      name: JOBS.send.name,
      payload: { messageId },
      jobId: 'job-1',
    };

    const send = JOB_RUNS[JOBS.send.name];

    await expect(send?.({ ...job, attempt: SEND_ATTEMPTS })).rejects.toThrow(/bounced/);
    expect(queued).toMatchObject({ payload: { messageId } });
    expect(mailbox.sent).toEqual([]);

    const { suppressions } = await owner.integrations.mail.suppressions.list({});

    expect(suppressions).toMatchObject([{ address: 'gone@example.mn', reason: 'bounce' }]);
    expect(
      (await clientAs('org-mail-a').integrations.mail.suppressions.list({})).suppressions,
    ).toEqual([]);

    await expect(
      owner.integrations.mail.compose({ ...mail, to: 'Gone@example.mn' }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    await owner.integrations.mail.suppressions.remove({ ids: suppressions.map(({ id }) => id) });

    // A failed mail is sent again on request.
    const [failed] = (await owner.conversations.messages.list({ conversationId })).messages;

    expect(failed).toMatchObject({ id: messageId, deliveryStatus: 'failed' });
    await expect(owner.conversations.messages.retry({ id: messageId })).resolves.toMatchObject({
      deliveryStatus: 'queued',
    });
    await expect(owner.conversations.messages.retry({ id: messageId })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await runQueued();

    expect(mailbox.sent.splice(0)).toMatchObject([{ to: 'gone@example.mn', subject: 'Order' }]);
  });
});
