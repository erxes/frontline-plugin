import { ORPCError } from '@orpc/server';
import { and, desc, eq, getTableColumns, inArray, isNull, sql } from 'drizzle-orm';
import { createSelectSchema } from 'drizzle-zod';
import { simpleParser } from 'mailparser';
import { z } from 'zod';
import { PERMISSIONS } from '#/core.ts';
import type { Tx } from '#/db/client.ts';
import { conversations, integrations, messages } from '#/db/inbox.ts';
import { emailSuppressions } from '#/db/mail.ts';
import { reads, writes } from '#/orpc.ts';

/** An address a report said to stop mailing, as a mailbox read it. */
export type Suppressed = Pick<
  typeof emailSuppressions.$inferInsert,
  'address' | 'reason' | 'detail'
>;

/** An address a report said to stop mailing, and the Message-ID of the mail it reports on. */
export type Reported = Suppressed & { about: string | null };

/** A report's `Field: value` blocks, names lowercased, with folded lines joined to their field. */
const reportBlocks = (text: string) =>
  text.split(/\r?\n[ \t]*\r?\n/).map((block) => {
    const fields = new Map<string, string>();

    for (const line of block.replace(/\r?\n[ \t]+/g, ' ').split(/\r?\n/)) {
      const [, name, value] = /^([A-Za-z-]+):\s*(.*)$/.exec(line) ?? [];

      if (name && value !== undefined) fields.set(name.toLowerCase(), value.trim());
    }

    return fields;
  });

/** `rfc822; Someone@Example.mn` as `someone@example.mn`. */
const reportAddress = (value: string) => (value.split(';').at(-1) ?? '').trim().toLowerCase();

/**
 * The addresses a delivery or spam report says to stop mailing: each recipient a delivery report
 * gave up on for good (a 5.x.x status), or the one a spam report names.
 */
const suppressedBy = (reportType: unknown, text: string): Suppressed[] =>
  reportBlocks(text).flatMap((fields): Suppressed[] => {
    const recipient = fields.get('final-recipient');
    const reported = fields.get('original-rcpt-to');

    // A mail to a forwarding address reports where it ended up as the final recipient, and the
    // address it was sent to as the original one; `suppress` keeps the one the team mailed.
    const recipients = [
      ...new Set(
        [recipient, fields.get('original-recipient')].flatMap((value) =>
          value ? [reportAddress(value)] : [],
        ),
      ),
    ];

    if (reportType === 'delivery-status' && recipient)
      return fields.get('action') === 'failed' && fields.get('status')?.startsWith('5')
        ? recipients.map((address) => ({
            address,
            reason: 'bounce',
            detail: fields.get('diagnostic-code') ?? fields.get('status') ?? null,
          }))
        : [];

    if (reportType === 'feedback-report' && reported)
      return [
        {
          address: reportAddress(reported),
          reason: 'complaint',
          detail: fields.get('feedback-type') ?? null,
        },
      ];

    return [];
  });

/**
 * The header every mail frontline sends carries its Message-ID in, since a relay such as SES
 * replaces the Message-ID itself and a report then returns the relay's.
 */
const SENT_ID_HEADER = 'X-Frontline-Message-ID';

/** The Message-ID a mail goes out with, and the header that keeps it through a relay. */
export const sentId = (messageId: string) => ({
  messageId,
  headers: { [SENT_ID_HEADER]: messageId },
});

/** The first id a header line named `header` gives in `parts`, folded onto the next line or not. */
const headerIn = (parts: string[], header: string) =>
  parts
    .map(
      (part) =>
        new RegExp(`^${header}:[ \\t]*(?:\\r?\\n[ \\t]+)?(<[^>\\s]+>)`, 'im').exec(part)?.[1],
    )
    .find((id) => id !== undefined);

/** Whether a report's part is the copy of the mail it is about. */
const isCopy = (part: { contentType: string }) => part.contentType === 'message/rfc822';

/**
 * What a `multipart/report` of `reportType` says, each address with the id of the mail it is
 * about, as frontline sent it. mailparser folds some report parts into the text and keeps others
 * as attachments; read whole, an inline copy would fold into the text without its headers.
 */
export const readReport = async (source: Buffer | string, reportType: unknown) => {
  const report = await simpleParser(source, { ignoreEmbedded: true });
  const copies = report.attachments.filter(isCopy).map((part) => part.content.toString());

  const fields = [
    report.text ?? '',
    ...report.attachments.filter((part) => !isCopy(part)).map((part) => part.content.toString()),
  ];

  const parts = [...copies, ...fields];
  const about = headerIn(parts, SENT_ID_HEADER) ?? headerIn(parts, 'message-id') ?? null;

  return suppressedBy(reportType, fields.join('\n\n')).map((row): Reported => ({ ...row, about }));
};

/**
 * Notes the addresses `accountId`'s reports named, each only when its report is about a mail the
 * team sent through that account to that address. Anyone can mail the mailbox a report, so one
 * about any other mail, or naming another recipient, changes nothing. An address already
 * suppressed stays as it was.
 */
export const suppress = async (tx: Tx, orgId: string, accountId: string, reported: Reported[]) => {
  const about = [...new Set(reported.flatMap((row) => (row.about ? [row.about] : [])))];

  if (about.length === 0) return;

  const sent = await tx
    .select({
      messageId: messages.externalId,
      // A mail thread's id starts with the address it is with, which its mails go to.
      address: sql<string>`split_part(${conversations.externalId}, ' ', 1)`,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(integrations, eq(integrations.id, conversations.integrationId))
    .where(
      and(
        inArray(messages.externalId, about),
        isNull(messages.customerId),
        sql`${integrations.config}->>'accountId' = ${accountId}`,
      ),
    );

  const real = new Set(sent.map((row) => `${row.messageId} ${row.address}`));

  const found = reported.flatMap(({ about: messageId, ...row }) =>
    messageId && real.has(`${messageId} ${row.address}`) ? [row] : [],
  );

  if (found.length === 0) return;

  await tx
    .insert(emailSuppressions)
    .values(found.map((row) => ({ ...row, orgId, accountId })))
    .onConflictDoNothing();
};

/** Which of `addresses` frontline no longer mails, lowercased. */
export const suppressedAmong = async (tx: Tx, addresses: string[]) => {
  const rows = await tx
    .select({ address: emailSuppressions.address })
    .from(emailSuppressions)
    .where(
      inArray(
        emailSuppressions.address,
        addresses.map((address) => address.toLowerCase()),
      ),
    );

  return rows.map((row) => row.address);
};

/** The row without `org_id`, which the caller knows. */
const { orgId, ...columns } = getTableColumns(emailSuppressions);

const Suppression = createSelectSchema(emailSuppressions).omit({ orgId: true });

/** The addresses frontline no longer mails, newest first. */
const list = reads(PERMISSIONS.integrationView)
  .route({ summary: 'List the email addresses mail is no longer sent to, newest first' })
  .input(z.object({}))
  .output(z.object({ suppressions: z.array(Suppression) }))
  .handler(async ({ context: { tx } }) => {
    const suppressions = await tx
      .select(columns)
      .from(emailSuppressions)
      .orderBy(desc(emailSuppressions.createdAt), desc(emailSuppressions.id));

    return { suppressions };
  });

/** Lets mail reach the addresses again, all of them or none. */
const remove = writes(PERMISSIONS.integrationManage)
  .route({ summary: 'Let mail reach suppressed addresses again; fails unless all of them exist' })
  .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
  .output(z.object({ ids: z.array(z.string()) }))
  .handler(async ({ input, context: { tx } }) => {
    const removed = await tx
      .delete(emailSuppressions)
      .where(inArray(emailSuppressions.id, input.ids))
      .returning({ id: emailSuppressions.id });

    if (removed.length !== new Set(input.ids).size)
      throw new ORPCError('NOT_FOUND', { message: 'No such suppressed address' });

    return { ids: removed.map((row) => row.id) };
  });

export const suppressionProcedures = { list, remove };
