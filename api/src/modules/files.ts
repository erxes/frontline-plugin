import { config } from '#/config.ts';
import { core } from '#/core.ts';

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
  });

  if (!sent.ok) throw new Error(`Core's storage refused the file: ${sent.status}`);

  const ready = await files.complete({ id: file.id });

  return { url: ready.url, name: ready.name, type: ready.contentType, size: ready.size };
};

/** A file of the organisation from core: its name and type, and its bytes as core streams them. */
export const readFile = async (orgId: string, id: string) => {
  const file = await core.forOrg(orgId).files.get({ id });

  if (!file.downloadUrl) return null;

  const answer = await fetch(new URL(file.downloadUrl, config.coreUrl));

  if (!answer.ok || !answer.body)
    throw new Error(`Core's storage refused the file: ${answer.status}`);

  return { name: file.name, contentType: file.contentType, size: file.size, body: answer.body };
};
