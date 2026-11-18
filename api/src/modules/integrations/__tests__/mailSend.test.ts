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
  sent: [] as {
    to: string;
    subject: string;
    messageId?: string;
    inReplyTo?: string;
    text?: string;
    headers?: Record<string, string>;
  }[],
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

    // Like a server, `n:*` past the newest uid still names the newest.
    async search({ uid }: { uid: string }) {
      const from = Number(uid.split(':')[0]);
      const uids = mailbox.inbox.map((_, index) => index + 1);
      const found = uids.filter((each) => each >= from);

      return found.length > 0 ? found : uids.slice(-1);
    }

    async *fetch(range: string) {
      const uids = new Set(range.split(',').map(Number));

      for (const [index, source] of mailbox.inbox.entries())
        if (uids.has(index + 1))
          yield { uid: index + 1, size: source.length, source: Buffer.from(source) };
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

    // A reaction is an RFC 9078 reply: one part, marked `reaction`, with the team's emojis.
    await owner.conversations.messages.react({ id: messages[0]?.id ?? '', emoji: '👍' });

    expect(mailbox.sent.splice(0)).toMatchObject([
      {
        to: 'saraa@example.mn',
        subject: 'Re: Your refund',
        inReplyTo: '<saraa-2@example.mn>',
        text: '👍',
        headers: { 'content-disposition': 'reaction' },
      },
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

  it('reads 50 mails a run and goes on from the last one it kept', async () => {
    mailbox.inbox.length = 0;

    const owner = clientAs('org-mail-c');

    await mailChannel('org-mail-c');

    for (let n = 1; n <= 51; n += 1)
      mailbox.inbox.push(
        [
          'From: Bat <bat@example.mn>',
          'To: support@shop.mn',
          'Subject: Order',
          `Message-ID: <bat-${n}@example.mn>`,
          // One thread, so one conversation.
          `References: <bat-1@example.mn>`,
          '',
          `Mail ${n}`,
        ].join('\r\n'),
      );

    const counted = async () =>
      (await owner.conversations.list({})).conversations.map(({ messageCount }) => messageCount);

    await sync('org-mail-c');
    expect(await counted()).toEqual([50]);

    await sync('org-mail-c');
    expect(await counted()).toEqual([51]);

    await sync('org-mail-c');
    expect(await counted()).toEqual([51]);
  });

  it('stops mailing an address that bounced until a member lets it through', async () => {
    mailbox.inbox.length = 0;

    const owner = clientAs('org-mail-b');
    const integration = await mailChannel('org-mail-b');
    const mail = { integrationId: integration.id, subject: 'Order', content: 'Shipped.' };

    const { conversationId } = await owner.integrations.mail.compose({
      ...mail,
      to: 'gone@example.mn',
    });

    await runQueued();

    const [delivered] = mailbox.sent.splice(0);

    const sentId = delivered?.messageId ?? '';

    expect(delivered?.to).toBe('gone@example.mn');
    expect(sentId).toMatch(/^<.+@shop\.mn>$/);
    // A relay such as SES rewrites the Message-ID, so a header keeps it.
    expect(delivered?.headers).toEqual({ 'X-Frontline-Message-ID': sentId });

    // A reply queued before the report arrives.
    const { id: messageId } = await owner.conversations.messages.create({
      conversationId,
      content: 'Did it arrive?',
    });

    const [queued] = asked.jobs.splice(0);

    // Anyone can mail the mailbox a report: one about a mail the team never sent, or about a sent
    // mail but naming another recipient, changes nothing.
    mailbox.inbox.push(
      fixture('mail-bounce.eml'),
      fixture('mail-bounce.eml')
        .replace('<sent-5@shop.mn>', sentId)
        .replaceAll(/gone@example\.mn/gi, 'saraa@example.mn'),
    );
    await sync('org-mail-b');
    expect((await owner.integrations.mail.suppressions.list({})).suppressions).toEqual([]);

    // The report about the mail that went out holds the reply, which fails on its last try.
    mailbox.inbox.push(fixture('mail-bounce.eml').replace('<sent-5@shop.mn>', sentId));
    await sync('org-mail-b');

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
    // A new mail's recipients leave the bounced address out.
    await expect(owner.integrations.mail.recipients({ search: 'saraa' })).resolves.toEqual([
      {
        customerId: 'customer-saraa',
        firstName: 'Saraa',
        lastName: null,
        email: 'saraa@example.mn',
      },
    ]);

    await owner.integrations.mail.suppressions.remove({ ids: suppressions.map(({ id }) => id) });

    // A failed mail is sent again on request.
    const { messages: thread } = await owner.conversations.messages.list({ conversationId });

    expect(thread.find((message) => message.id === messageId)).toMatchObject({
      deliveryStatus: 'failed',
    });
    await expect(owner.conversations.messages.retry({ id: messageId })).resolves.toMatchObject({
      deliveryStatus: 'queued',
    });
    await expect(owner.conversations.messages.retry({ id: messageId })).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    await runQueued();

    expect(mailbox.sent.splice(0)).toMatchObject([
      { to: 'gone@example.mn', subject: 'Re: Order', text: 'Did it arrive?' },
    ]);
  });
});
