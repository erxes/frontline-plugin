import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { convert } from 'html-to-text';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { createTransport } from 'nodemailer';
import { z } from 'zod';
import { withOrg } from '#/db/client.ts';
import { logger } from '#/logger.ts';
import { attachedFile } from '#/modules/files.ts';
import { isBlockedIp, reachableAddress, reachableLookup } from '#/modules/outbound.ts';
import { defineProvider, type InboundMessage } from '../provider.ts';
import { automated } from './mailAutomated.ts';
import { botText } from './botText.ts';
import { readReport, type Reported, sentId, suppressedAmong } from './mailSuppressions.ts';
import { type SyncState, syncFailure } from './mailSync.ts';

export const Server = z.object({
  host: z.string().trim().min(1).max(255),
  port: z.number().int().min(1).max(65535),
  /** TLS from the first byte (993, 465); otherwise STARTTLS when the server offers it. */
  secure: z.boolean(),
  user: z.string().trim().min(1).max(320),
});

const Config = z.object({ imap: Server, smtp: Server });

const Secret = z.object({ imapPassword: z.string(), smtpPassword: z.string() });

/** `Server` as a member types it: an IP must be public, and a name is checked when it's dialed. */
export const ServerInput = Server.extend({
  host: Server.shape.host.refine(
    (host) => !isBlockedIp(host),
    'A public address, not a private one',
  ),
});

/**
 * A member names the host, so it may only be a public address. A socket dials an IP without the
 * lookup, so one is checked here; imapflow hands `tls` to the socket it opens, `lookup` included.
 */
const imapClient = (imap: z.infer<typeof Server>, password: string) => {
  if (isBlockedIp(imap.host)) throw new Error(`${imap.host} is not a public address`);

  return new ImapFlow({
    host: imap.host,
    port: imap.port,
    secure: imap.secure,
    auth: { user: imap.user, pass: password },
    logger: false,
    tls: { lookup: reachableLookup },
  });
};

/**
 * nodemailer resolves names itself and takes no lookup, so it dials the checked address and
 * checks TLS against the host's name.
 */
const smtpTransport = async (smtp: z.infer<typeof Server>, password: string) =>
  createTransport({
    host: await reachableAddress(smtp.host),
    servername: isIP(smtp.host) ? undefined : smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: password },
    // Attachments go as the bytes core holds, so nodemailer reads no path or address itself.
    disableFileAccess: true,
    disableUrlAccess: true,
  });

const firstAddress = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value;

/**
 * What a mail message keeps for its replies: they answer its subject, in its thread. A new mail
 * a member writes keeps its own Message-ID as `root`.
 */
export const MailData = z.object({ subject: z.string().optional(), root: z.string().optional() });

/** A new Message-ID for a mail `address` sends, on its domain. */
export const newMessageId = (address: string) =>
  `<${randomUUID()}@${address.split('@').at(-1) ?? 'localhost'}>`;

/** The address a mail thread is with: its id starts with it. */
const threadAddress = (threadId: string) => threadId.split(' ')[0] ?? threadId;

/** A parsed `Content-Type` header. */
const ContentType = z.object({ value: z.string(), params: z.record(z.string(), z.string()) });

/** What one fetched mail is to frontline: a customer's message, or a report on what it sent. */
type ReadMail = { message: InboundMessage } | { suppressed: Reported[] };

/**
 * One mail as frontline reads it, or null for one without a sender or id, or one the mailbox sent
 * itself. A delivery or spam report names the addresses to stop mailing. Replies join the thread
 * of the first message they reference. The customer is the sender's address, and a conversation
 * is one sender's part of a thread, so someone copied in who answers too gets a conversation of
 * their own.
 */
export const readMail = async (
  source: Buffer | string,
  address: string,
): Promise<ReadMail | null> => {
  const mail = await simpleParser(source);
  const type = ContentType.safeParse(mail.headers.get('content-type')).data;

  if (type?.value === 'multipart/report')
    return { suppressed: await readReport(source, type.params['report-type']) };

  const from = mail.from?.value[0];
  const sender = from?.address?.toLowerCase();

  if (!mail.messageId || !sender || sender === address.toLowerCase()) return null;

  const root = firstAddress(mail.references) ?? mail.inReplyTo ?? mail.messageId;
  // mailparser leaves the text empty for an HTML part beside files, with no plain text part.
  const text = mail.text || (mail.html ? convert(mail.html, { wordwrap: false }) : '');

  return {
    message: {
      threadId: `${sender} ${root}`,
      messageId: mail.messageId,
      author: { externalId: sender, name: from?.name || sender, email: sender },
      text,
      forAgent: Boolean(text.trim()) && !automated(mail.headers),
      providerData: { subject: mail.subject, root } satisfies z.infer<typeof MailData>,
      attachments: [],
      files: mail.attachments.map((part) => ({
        name: part.filename ?? 'attachment',
        contentType: part.contentType,
        bytes: async () => part.content,
      })),
    },
  };
};

/** How many mails one pull reads at most; the rest wait for the next run. */
const PULL_MAILS = 50;

/** How many bytes of mail one pull downloads at most. A bigger mail is skipped. */
const PULL_BYTES = 25 * 1024 * 1024;

/**
 * Which of `sized`, in uid order, one pull downloads: up to `PULL_MAILS` of them and `PULL_BYTES`
 * in all. A mail bigger than `PULL_BYTES` is skipped, logged, so it can't hold the rest back.
 * `lastUid` is the last one taken or skipped.
 */
const pick = (sized: { uid: number; size: number }[], address: string) => {
  const uids: number[] = [];
  let bytes = 0;
  let lastUid: number | undefined;

  for (const { uid, size } of sized.slice(0, PULL_MAILS)) {
    if (size > PULL_BYTES) logger.warn({ address, uid, size }, 'mail too big to read');
    else if (bytes + size > PULL_BYTES) break;
    else {
      bytes += size;
      uids.push(uid);
    }

    lastUid = uid;
  }

  return { uids, lastUid };
};

/**
 * Up to `PULL_MAILS` messages that reached INBOX since `state`, each with its uid, the addresses
 * its reports said to stop mailing, and where this pull leaves off. The first pull of a mailbox
 * only notes where INBOX stands, so connecting one doesn't import its history.
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

      if (!state || state.uidValidity !== uidValidity)
        return {
          messages: [],
          suppressed: [],
          state: { uidValidity, lastUid: mailbox.uidNext - 1 },
        };

      const messages: { uid: number; message: InboundMessage }[] = [];
      const suppressed: Reported[] = [];
      // `n:*` names the newest mail even when its uid is below n, so only higher uids count.
      const found = await client.search({ uid: `${state.lastUid + 1}:*` }, { uid: true });

      // A failed search gives false or nothing.
      const fresh = (Array.isArray(found) ? found : [])
        .filter((uid) => uid > state.lastUid)
        .toSorted((a, b) => a - b);

      if (fresh.length === 0) return { messages, suppressed, state };

      const sized = [];

      for await (const { uid, size = 0 } of client.fetch(
        fresh.slice(0, PULL_MAILS).join(','),
        { uid: true, size: true },
        { uid: true },
      ))
        sized.push({ uid, size });

      const { uids, lastUid = state.lastUid } = pick(
        sized.toSorted((a, b) => a.uid - b.uid),
        address,
      );

      if (uids.length > 0)
        for await (const fetched of client.fetch(
          uids.join(','),
          { uid: true, source: true },
          { uid: true },
        )) {
          const read = fetched.source
            ? await readMail(fetched.source, address).catch((error: unknown) => {
                logger.error({ err: error, address, uid: fetched.uid }, 'mail that does not parse');

                return null;
              })
            : null;

          if (!read)
            logger.warn(
              { address, uid: fetched.uid },
              'mail skipped: no sender or Message-ID, or the mailbox sent it',
            );
          else if ('message' in read) messages.push({ uid: fetched.uid, message: read.message });
          else suppressed.push(...read.suppressed);
        }

      return {
        messages: messages.toSorted((a, b) => a.uid - b.uid),
        suppressed,
        state: { uidValidity, lastUid },
      };
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
    await (await smtpTransport(config.smtp, secret.smtpPassword)).verify();

    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'The mail server refused the login';
  }
};

/** A reply's subject: the one it answers, with one `Re:`. */
const replySubject = (subject: string) =>
  !subject || /^re:/i.test(subject) ? subject : `Re: ${subject}`;

/** Refuses an address that bounced or reported spam. */
const checkSuppressed = async (orgId: string, address: string) => {
  const [blocked] = await withOrg(orgId, (tx) => suppressedAmong(tx, [address]));

  if (blocked) throw new Error(`${blocked} bounced or reported spam, so it isn't mailed`);
};

/** A mailbox the organisation already has: frontline reads INBOX over IMAP and replies over SMTP. */
export const mail = defineProvider({
  name: 'mail',
  Config,
  Secret,
  // A mailbox that logs in but keeps failing to sync stays broken until a sync gets through.
  check: async ({ config, secret, row }) =>
    (await checkMail(config, secret)) ?? syncFailure(row.syncState),
  // A mail goes to the address its thread is with, which a customer with two addresses needs.
  send: async ({ config, secret, row }, message) => {
    const to = threadAddress(message.threadId);

    await checkSuppressed(row.orgId, to);

    // A mail that starts a thread brings its own subject and Message-ID.
    const started = message.replyTo
      ? undefined
      : MailData.safeParse(message.providerData ?? {}).data;

    const { subject = '', root } =
      MailData.safeParse(message.replyTo?.providerData ?? {}).data ?? {};

    const answered = message.replyTo?.externalId;

    const attachments = await Promise.all(
      message.attachments.map(async (file) => {
        const read = await attachedFile(row.orgId, file);

        return {
          filename: read.name,
          contentType: read.type,
          content: Buffer.from(await read.arrayBuffer()),
        };
      }),
    );

    const messageId = started?.root ?? newMessageId(row.externalId);

    await (
      await smtpTransport(config.smtp, secret.smtpPassword)
    ).sendMail({
      from: { name: row.name, address: row.externalId },
      to,
      subject: started ? (started.subject ?? '') : replySubject(subject),
      ...sentId(messageId),
      text: botText(message),
      html: message.html ?? undefined,
      inReplyTo: answered,
      references: [...new Set([root, answered].filter((id) => id !== undefined))],
      attachments,
    });

    return messageId;
  },
  // RFC 9078: a reply whose one part, marked `reaction`, holds the team's emojis now; none
  // takes them all back.
  react: async ({ config, secret, row }, { threadId, message, emojis }) => {
    const to = threadAddress(threadId);

    await checkSuppressed(row.orgId, to);

    const { subject = '', root } = MailData.safeParse(message.providerData ?? {}).data ?? {};

    await (
      await smtpTransport(config.smtp, secret.smtpPassword)
    ).sendMail({
      from: { name: row.name, address: row.externalId },
      to,
      subject: replySubject(subject),
      inReplyTo: message.externalId,
      references: [...new Set([root, message.externalId].filter((id) => id !== undefined))],
      text: [...new Set(emojis)].join(''),
      headers: { 'content-disposition': 'reaction' },
    });
  },
});
