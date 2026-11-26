import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { PERMISSIONS } from '#/core.ts';
import { clientAs } from '#/test/member.ts';
import { readMail } from '../providers/mail.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

describe('mail', () => {
  it('reads a reply into the part of its thread that is its sender', async () => {
    const read = await readMail(fixture('mail-reply.eml'), 'support@shop.mn');

    expect(read).toMatchObject({
      message: {
        threadId: 'saraa@example.mn <first-1@example.mn>',
        messageId: '<reply-2@example.mn>',
        author: { externalId: 'saraa@example.mn', name: 'Saraa' },
        providerData: { subject: 'Re: Refund for order 1042', root: '<first-1@example.mn>' },
        attachments: [],
      },
    });
    expect(read && 'message' in read ? read.message.text : '').toMatch(
      /^Thanks, the refund arrived\./,
    );
    // A person wrote it, so an AI agent may answer it.
    expect(read).toMatchObject({ message: { forAgent: true } });
  });

  it('gives an AI agent no auto-reply, mailing list or bulk mail', async () => {
    const reply = fixture('mail-reply.eml').toString();

    for (const header of [
      'Auto-Submitted: auto-replied',
      'Precedence: bulk',
      'List-Id: <news.example.mn>',
      'X-Autoreply: yes',
    ])
      await expect(
        readMail(reply.replace('MIME-Version', `${header}\r\nMIME-Version`), 'support@shop.mn'),
      ).resolves.toMatchObject({ message: { forAgent: false } });

    await expect(
      readMail(
        reply.replace('MIME-Version', 'Auto-Submitted: no\r\nMIME-Version'),
        'support@shop.mn',
      ),
    ).resolves.toMatchObject({ message: { forAgent: true } });
  });

  it('skips what the mailbox sent itself', async () => {
    await expect(readMail(fixture('mail-sent.eml'), 'Support@Shop.mn')).resolves.toBeNull();
  });

  it('skips a message without a sender', async () => {
    await expect(
      readMail('Message-ID: <x@y>\r\nSubject: no sender\r\n\r\nbody', 'support@shop.mn'),
    ).resolves.toBeNull();
  });

  it('reads a delivery report as the recipients it gave up on for good', async () => {
    await expect(readMail(fixture('mail-bounce.eml'), 'support@shop.mn')).resolves.toEqual({
      suppressed: [
        {
          address: 'gone@example.mn',
          reason: 'bounce',
          detail: 'smtp; 550 5.1.1 <gone@example.mn>: Recipient address rejected: User unknown',
          // The copy it returns names the mail it is about.
          about: '<sent-5@shop.mn>',
        },
      ],
    });
  });

  it('reads the id frontline sent from an inline copy whose Message-ID a relay replaced', async () => {
    // A long domain folds the header onto a second line.
    const relayed = fixture('mail-bounce.eml')
      .toString()
      .replace(
        'Content-Type: message/rfc822\n',
        'Content-Type: message/rfc822\nContent-Disposition: inline\n',
      )
      .replace(
        'Message-ID: <sent-5@shop.mn>',
        'Message-ID: <0100abc@email.amazonses.com>\nX-Frontline-Message-ID:\n <sent-5@shop.mn>',
      );

    await expect(readMail(relayed, 'support@shop.mn')).resolves.toMatchObject({
      suppressed: [{ address: 'gone@example.mn', about: '<sent-5@shop.mn>' }],
    });
  });

  it("suggests a known service's servers for its own addresses", async () => {
    await expect(
      clientAs('org-mail-servers').integrations.mail.servers({ address: 'Saraa@Gmail.com' }),
    ).resolves.toEqual({
      service: 'google',
      imap: { host: 'imap.gmail.com', port: 993 },
      smtp: { host: 'smtp.gmail.com', port: 465 },
    });
  });

  it("suggests the domain's own servers when nothing tells where it is hosted", async () => {
    await expect(
      clientAs('org-mail-servers').integrations.mail.servers({ address: 'help@shop.invalid' }),
    ).resolves.toEqual({
      service: null,
      imap: { host: 'imap.shop.invalid', port: 993 },
      smtp: { host: 'smtp.shop.invalid', port: 465 },
    });
  });

  it("refuses a mailbox on the API's own network, loopback or the metadata service", async () => {
    const server = { host: 'mail.shop.mn', port: 993, secure: true, user: 'support@shop.mn' };

    for (const host of ['10.0.0.5', '::1', '169.254.169.254'])
      await expect(
        clientAs('org-mail-servers').integrations.mail.connect({
          address: 'support@shop.mn',
          name: 'Shop support',
          imap: { ...server, host, password: 'imap-secret' },
          smtp: { ...server, port: 465, password: 'smtp-secret' },
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('suggests servers only to members who connect accounts', async () => {
    await expect(
      clientAs('org-mail-servers', [PERMISSIONS.integrationView]).integrations.mail.servers({
        address: 'help@gmail.com',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('reads a spam report as the recipient who sent it', async () => {
    await expect(readMail(fixture('mail-complaint.eml'), 'support@shop.mn')).resolves.toEqual({
      suppressed: [
        {
          address: 'annoyed@example.mn',
          reason: 'complaint',
          detail: 'abuse',
          about: '<offer-9@shop.mn>',
        },
      ],
    });
  });
});
