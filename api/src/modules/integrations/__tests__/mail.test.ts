import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vite-plus/test';
import { inboundOfMail } from '../providers/mail.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

describe('mail', () => {
  it('reads a reply into the part of its thread that is its sender', async () => {
    const message = await inboundOfMail(fixture('mail-reply.eml'), 'support@shop.mn');

    expect(message).toMatchObject({
      threadId: 'saraa@example.mn <first-1@example.mn>',
      messageId: '<reply-2@example.mn>',
      author: { externalId: 'saraa@example.mn', name: 'Saraa' },
      providerData: { subject: 'Re: Refund for order 1042', root: '<first-1@example.mn>' },
      attachments: [],
    });
    expect(message?.text).toMatch(/^Thanks, the refund arrived\./);
  });

  it('skips what the mailbox sent itself', async () => {
    await expect(inboundOfMail(fixture('mail-sent.eml'), 'Support@Shop.mn')).resolves.toBeNull();
  });

  it('skips a message without a sender', async () => {
    await expect(
      inboundOfMail('Message-ID: <x@y>\r\nSubject: no sender\r\n\r\nbody', 'support@shop.mn'),
    ).resolves.toBeNull();
  });
});
