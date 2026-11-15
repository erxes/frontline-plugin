import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
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
        },
      ],
    });
  });

  it('reads a spam report as the recipient who sent it', async () => {
    await expect(readMail(fixture('mail-complaint.eml'), 'support@shop.mn')).resolves.toEqual({
      suppressed: [{ address: 'annoyed@example.mn', reason: 'complaint', detail: 'abuse' }],
    });
  });
});
