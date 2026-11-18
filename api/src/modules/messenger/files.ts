import { and, eq } from 'drizzle-orm';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { withOrg } from '#/db/client.ts';
import { conversations, messages } from '#/db/inbox.ts';
import { tickets } from '#/db/tickets.ts';
import { fail } from '../fail.ts';
import {
  carries,
  rawUpload,
  readFile,
  receiptOf,
  sendFile,
  storeFile,
  type Uploaded,
  uploadOf,
} from '../files.ts';
import { type Visitor, visitorOf, visitorReceiptOwner } from './session.ts';
import { asVisitor } from './threads.ts';

/**
 * The visitor uploads a file's bytes, named in `x-file-name`; core stores it, and the visitor's
 * next message attaches it by the receipt this answers with it.
 */
const upload = asVisitor(async (visitor, req, res) => {
  const file = await storeFile(visitor.orgId, uploadOf(req));
  const reply: Uploaded = { ...file, receipt: await receiptOf(visitorReceiptOwner(visitor), file) };

  res.status(201).json(reply);
});

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

    sendFile(res, file, 'private, max-age=300');
  } catch (error) {
    fail(res, error, 'messenger file');
  }
};

/** A visitor's files, under `/api/public/messenger/files`. */
export const fileRoutes = () => express.Router().post('/', rawUpload, upload).get('/:id', download);
