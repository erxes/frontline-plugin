import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createTransport } from 'nodemailer';
import { z } from 'zod';
import { logger } from '#/logger.ts';
import { defineProvider, type InboundMessage } from '../provider.ts';

export const Server = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  /** TLS from the first byte (993, 465); otherwise STARTTLS when the server offers it. */
  secure: z.boolean(),
  user: z.string().trim().min(1).max(320),
});

const Config = z.object({ imap: Server, smtp: Server });

const Secret = z.object({ imapPassword: z.string(), smtpPassword: z.string() });

/** Where the last pull left off in INBOX. A new `uidValidity` means the uids started over. */
export const SyncState = z.object({ uidValidity: z.string(), lastUid: z.number().int() });

const imapClient = (imap: z.infer<typeof Server>, password: string) =>
  new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.secure,
    auth: { user: imap.user, pass: password },
    logger: false,
  });

const smtpTransport = (smtp: z.infer<typeof Server>, password: string) =>
  createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: password },
  });

const firstAddress = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/** What a mail message keeps for its replies: they answer its subject, in its thread. */
const MailData = z.object({ subject: z.string().optional(), root: z.string().optional() });

/**
 * One message as the inbox reads it, or null for one without a sender or id, or one the mailbox
 * sent itself. Replies join the thread of the first message they reference. The customer is the
 * sender's address, and a conversation is one sender's part of a thread, so someone copied in who
 * answers too gets a conversation of their own.
 */
export const inboundOfMail = async (
  source: Buffer | string,
  address: string,
): Promise<InboundMessage | null> => {
  const mail = await simpleParser(source);
  const from = mail.from?.value[0];
  const sender = from?.address?.toLowerCase();

  if (!mail.messageId || !sender || sender === address.toLowerCase()) return null;

  const root = firstAddress(mail.references) ?? mail.inReplyTo ?? mail.messageId;

  return {
    threadId: `${sender} ${root}`,
    messageId: mail.messageId,
    author: { externalId: sender, name: from?.name || sender },
    text: mail.text || '',
    providerData: { subject: mail.subject, root } satisfies z.infer<typeof MailData>,
    attachments: [],
  };
};

/**
 * The messages that reached INBOX since `state`, and where this pull leaves off. The first pull
 * of a mailbox only notes where INBOX stands, so connecting one doesn't import its history.
 */
export const pullMail = async (
  imap: z.infer<typeof Server>,
  password: string,
  address: string,
  state: z.infer<typeof SyncState> | null,
) => {
  const client = imapClient(imap, password);

  await client.connect();

  try {
    const lock = await client.getMailboxLock('INBOX');

    try {
      const mailbox = client.mailbox;

      if (!mailbox) throw new Error('INBOX did not open');

      const uidValidity = String(mailbox.uidValidity);
      const last = mailbox.uidNext - 1;

      if (!state || state.uidValidity !== uidValidity)
        return { messages: [], state: { uidValidity, lastUid: last } };

      const messages: InboundMessage[] = [];
      let lastUid = state.lastUid;

      if (last > state.lastUid) {
        for await (const fetched of client.fetch(
          `${state.lastUid + 1}:*`,
          { uid: true, source: true },
          { uid: true },
        )) {
          if (fetched.uid <= state.lastUid || !fetched.source) continue;

          const message = await inboundOfMail(fetched.source, address);

          if (message) messages.push(message);
          else logger.warn({ address, uid: fetched.uid }, 'mail without a sender or Message-ID');

          lastUid = Math.max(lastUid, fetched.uid);
        }
      }

      return { messages, state: { uidValidity, lastUid } };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
};

/** Why the servers refuse the login, or null when both accept it. */
export const checkMail = async (config: z.infer<typeof Config>, secret: z.infer<typeof Secret>) => {
  try {
    const client = imapClient(config.imap, secret.imapPassword);

    await client.connect();
    await client.logout();
    await smtpTransport(config.smtp, secret.smtpPassword).verify();

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'The mail server refused the login';
  }
};

/** A mailbox the organisation already has: frontline reads INBOX over IMAP and replies over SMTP. */
export const mail = defineProvider({
  name: 'mail',
  Config,
  Secret,
  check: async ({ config, secret }) => checkMail(config, secret),
  send: async ({ config, secret, row }, message) => {
    const { subject = '', root } =
      MailData.safeParse(message.replyTo?.providerData ?? {}).data ?? {};

    const answered = message.replyTo?.externalId;

    const sent = await smtpTransport(config.smtp, secret.smtpPassword).sendMail({
      from: { name: row.name, address: row.externalId },
      to: message.to,
      subject: !subject || /^re:/i.test(subject) ? subject : `Re: ${subject}`,
      text: message.text,
      inReplyTo: answered,
      references: [...new Set([root, answered].filter((id) => id !== undefined))],
      attachments: message.attachments.map((file) => ({ filename: file.name, path: file.url })),
    });

    return sent.messageId;
  },
});
