import { Readable } from 'node:stream';
import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import { config } from '#/config.ts';
import { core } from '#/core.ts';
import { Attachment, CORE_FILE, type StoredFile } from '#/db/table.ts';
import { readToken, signToken } from './tokens.ts';

/**
 * Stores `bytes` as a file of the organisation in core, and gives it as records keep their files
 * (`Attachment`). Core refuses a type or a size the organisation's file settings don't allow.
 */
export const storeFile = async (
  orgId: string,
  { name, contentType, bytes }: { name: string; contentType: string; bytes: Uint8Array },
) => {
  const files = core.forOrg(orgId).files;
  const { file, upload } = await files.createUpload({ name, contentType, size: bytes.length });

  const sent = await fetch(new URL(upload.url, config.coreUrl), {
    method: upload.method,
    headers: upload.headers,
    body: bytes,
    // The bytes go in one request, so they get longer than an API call.
    signal: AbortSignal.timeout(4 * config.outboundMs),
  });

  if (!sent.ok) throw new Error(`Core's storage refused the file: ${sent.status}`);

  const ready = await files.complete({ id: file.id });

  return { url: ready.url, name: ready.name, type: ready.contentType, size: ready.size };
};

/**
 * A file of the organisation from core: its name and type, and its bytes as core streams them.
 * Core has `config.outboundMs` to start answering; the stream itself takes as long as it takes.
 */
export const readFile = async (orgId: string, id: string) => {
  const file = await core.forOrg(orgId).files.get({ id });

  if (!file.downloadUrl) return null;

  const started = new AbortController();

  const timer = setTimeout(
    () => started.abort(new Error('Core did not send the file')),
    config.outboundMs,
  );

  const answer = await fetch(new URL(file.downloadUrl, config.coreUrl), {
    signal: started.signal,
  }).finally(() => clearTimeout(timer));

  if (!answer.ok || !answer.body)
    throw new Error(`Core's storage refused the file: ${answer.status}`);

  return { name: file.name, contentType: file.contentType, size: file.size, body: answer.body };
};

/** The id of the core file at `url`, the address core gives its files, or null for another address. */
export const fileIdOf = (url: string) => CORE_FILE.exec(url)?.[1] ?? null;

/**
 * A file a member attached to what a provider sends, read from core: providers get its bytes,
 * never its address. Throws for a file core doesn't hold or one at any other address.
 */
export const attachedFile = async (orgId: string, file: StoredFile) => {
  const id = fileIdOf(file.url);
  const read = id ? await readFile(orgId, id) : null;

  if (!read) throw new Error(`No file in core's storage at ${file.url}`);

  return read;
};

/**
 * Streams a file read from core to a signed-out visitor, cached as `cacheControl` says: an image
 * shows inline, anything else downloads, and nothing in it runs.
 */
export const sendFile = (
  res: Response,
  file: NonNullable<Awaited<ReturnType<typeof readFile>>>,
  cacheControl: string,
) => {
  res.set({
    'content-type': file.contentType,
    'content-length': String(file.size),
    'cache-control': cacheControl,
    'x-content-type-options': 'nosniff',
    'content-security-policy':
      "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
  });

  if (file.contentType.startsWith('image/')) res.set('content-disposition', 'inline');
  else res.attachment(file.name);

  Readable.fromWeb(file.body).pipe(res);
};

/** The most a signed-out visitor uploads at once; core's file settings may allow less. */
const MAX_BYTES = 25 * 1024 * 1024;

/** Reads a signed-out upload's body as bytes. */
export const rawUpload = express.raw({ type: () => true, limit: MAX_BYTES });

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

/** The file a signed-out visitor sends: its bytes, named in `x-file-name`. */
export const uploadOf = (req: Request) => {
  const bytes: unknown = req.body;

  return Upload.parse({
    name: req.get('x-file-name'),
    contentType: req.get('content-type'),
    bytes,
  });
};

/**
 * A signed receipt for a file a signed-out visitor uploaded, for `owner`: the visitor or form
 * that may attach it. What they send attaches files by receipt only, never by address, so it
 * carries only files they uploaded.
 */
export const receiptOf = (owner: string, file: Attachment) =>
  signToken('file receipts', { file }, '1d', owner);

const Receipt = z.object({ file: Attachment });

/** The files `receipts` name for `owner`, or null when any is forged, expired or someone else's. */
export const filesOf = async (owner: string, receipts: string[]) => {
  const files = await Promise.all(
    receipts.map(
      async (receipt) => (await readToken('file receipts', receipt, Receipt, owner))?.file ?? null,
    ),
  );

  const good = files.filter((file) => file !== null);

  return good.length === receipts.length ? good : null;
};

/** A file a visitor uploaded, and the receipt they attach it by. */
export type Uploaded = Attachment & { receipt: string };
