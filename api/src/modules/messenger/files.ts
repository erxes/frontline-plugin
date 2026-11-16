import { Readable } from 'node:stream';
import { and, eq, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { withOrg } from '#/db/client.ts';
import { conversations, messages } from '#/db/inbox.ts';
import type { Attachment } from '#/db/table.ts';
import { tickets } from '#/db/tickets.ts';
import { fail } from '../fail.ts';
import { readFile, storeFile } from '../files.ts';
import { receiptOf, type Visitor, visitorOf } from './session.ts';
import { asVisitor } from './threads.ts';

/** The most a visitor uploads at once; core's file settings may allow less. */
const MAX_BYTES = 25 * 1024 * 1024;

const Upload = z.object({
  /** The file's name, URI-encoded, since a header carries only ASCII. */
  name: z
    .string()
    .min(1)
    .max(1500)
    .transform((name) => decodeURIComponent(name).trim().slice(0, 500)),
  contentType: z.string().min(1).max(200),
  bytes: z.instanceof(Buffer).refine((bytes) => bytes.length > 0, 'Send the file'),
});

/**
 * The visitor uploads a file's bytes, named in `x-file-name`; core stores it, and the visitor's
 * next message attaches it by the receipt this answers with it.
 */
const upload = asVisitor(async (visitor, req, res) => {
  const bytes: unknown = req.body;

  const input = Upload.parse({
    name: req.get('x-file-name'),
    contentType: req.get('content-type'),
    bytes,
  });

  const file = await storeFile(visitor.orgId, input);
  const reply: Uploaded = { ...file, receipt: await receiptOf(visitor, file) };

  res.status(201).json(reply);
});

/** A file the visitor uploaded, and the receipt their message attaches it by. */
export type Uploaded = Attachment & { receipt: string };

/** Whether the attachments in `column` name the core file `id`, at the address core gives it. */
const carries = (column: AnyPgColumn, id: string) => {
  const ending = `/files/${id}/download`;

  return sql`exists (
    select 1 from jsonb_array_elements(${column}) file
    where right(file->>'url', ${ending.length}) = ${ending}
  )`;
};

/** Whether a message the visitor can read, or a ticket they filed, carries the core file `id`. */
const seesFile = (visitor: Visitor, id: string) =>
  withOrg(visitor.orgId, async (tx) => {
    const [message] = await tx
      .select({ id: messages.id })
      .from(messages)
      .innerJoin(conversations, eq(conversations.id, messages.conversationId))
      .where(
        and(
          eq(conversations.integrationId, visitor.integrationId),
          eq(conversations.customerId, visitor.customerId),
          eq(messages.internal, false),
          carries(messages.attachments, id),
        ),
      )
      .limit(1);

    const [found] = message
      ? [message]
      : await tx
          .select({ id: tickets.id })
          .from(tickets)
          .where(and(eq(tickets.customerId, visitor.customerId), carries(tickets.attachments, id)))
          .limit(1);

    return Boolean(found);
  });

const Download = z.object({ id: z.string().regex(/^[\w-]{1,64}$/), token: z.string() });

/**
 * A file of the visitor's conversations, streamed from core, which serves its files to members
 * only. An image shows inline; anything else downloads. An `<img>` can't send headers, so the
 * token is in the address.
 */
const download = async (req: Request, res: Response) => {
  try {
    const input = Download.safeParse({ ...req.params, token: req.query.token });
    const visitor = input.success ? await visitorOf(input.data.token) : null;

    const file =
      input.success && visitor && (await seesFile(visitor, input.data.id))
        ? await readFile(visitor.orgId, input.data.id)
        : null;

    if (!file) {
      res.status(404).json({ message: 'No such file' });

      return;
    }

    res.set({
      'content-type': file.contentType,
      'content-length': String(file.size),
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
      // A file shown inline can't run scripts.
      'content-security-policy':
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    });

    if (file.contentType.startsWith('image/')) res.set('content-disposition', 'inline');
    else res.attachment(file.name);

    Readable.fromWeb(file.body).pipe(res);
  } catch (error) {
    fail(res, error, 'messenger file');
  }
};

/** A visitor's files, under `/api/public/messenger/files`. */
export const fileRoutes = () =>
  express
    .Router()
    .post('/', express.raw({ type: () => true, limit: MAX_BYTES }), upload)
    .get('/:id', download);
