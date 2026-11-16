import type { Uploaded as UploadReply } from '@frontline/api/files';
import type { Jsonify } from 'type-fest';
import wretch from 'wretch';

/** A file the visitor uploaded; what they send attaches it by its `receipt`. */
export type Uploaded = Jsonify<UploadReply>;

/**
 * frontline's public API under `base`: paths append to it, and a refusal's error carries the
 * message the route gave and its whole answer as `body`.
 */
export const publicApi = (base: URL) =>
  wretch(base.href).customError(async (error, response) => {
    let body: unknown = null;

    try {
      body = await response.json();
    } catch {
      // Not JSON: the error keeps the status text.
    }

    if (typeof body === 'object' && body && 'message' in body && typeof body.message === 'string')
      error.message = body.message;

    return Object.assign(error, { body });
  });

/** Uploads `file`'s bytes to `path` of `http`, named in `x-file-name` since a header is ASCII. */
export const uploadFile = (http: ReturnType<typeof publicApi>, path: string, file: File) =>
  http
    .headers({
      'content-type': file.type || 'application/octet-stream',
      'x-file-name': encodeURIComponent(file.name),
    })
    .body(file)
    .post(undefined, path)
    .json<Uploaded>();

/** The bearer header of a visitor's token. */
export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
