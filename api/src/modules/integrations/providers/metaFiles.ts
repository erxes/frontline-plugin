import type { PluginJobDelivery } from '@erxes/core-contract';
import { enqueueJob } from '@erxes/plugin-sdk';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { JOBS } from '#/core.ts';
import { type Tx, withOrg } from '#/db/client.ts';
import { messages } from '#/db/inbox.ts';
import type { StoredFile } from '#/db/table.ts';
import { logger } from '#/logger.ts';
import { downloadFile, FileRefused, storeFile } from '#/modules/files.ts';
import { inOrder } from '../provider.ts';

/** Meta's CDNs, which hold the files people send for as long as their signed links last. */
const META_CDN = /(^|\.)(fbcdn\.net|fbsbx\.com|cdninstagram\.com)$/;

const onMetaCdn = ({ url }: StoredFile) => {
  const at = URL.parse(url);

  return at?.protocol === 'https:' && META_CDN.test(at.hostname);
};

/** The file name the link ends in, such as `photo.jpg`, else the name Meta gave the file. */
const nameOf = (file: StoredFile) => {
  try {
    const name = decodeURIComponent(URL.parse(file.url)?.pathname.split('/').at(-1) ?? '');

    return /.+\.\w+$/.test(name) ? name : file.name;
  } catch {
    return file.name;
  }
};

/**
 * Has a job copy the message's files on Meta's CDN to core's storage once it is kept, since
 * Meta's signed links expire. Until the copy lands the links work. None for a message without.
 */
export const copiesOf = (attachments: StoredFile[]) =>
  attachments.some(onMetaCdn)
    ? (tx: Tx, message: { id: string; orgId: string }) =>
        enqueueJob(tx, {
          orgId: message.orgId,
          name: JOBS.metaFiles.name,
          payload: { messageId: message.id },
        })
    : undefined;

const copyOf = async (orgId: string, file: StoredFile) => {
  const blob = await downloadFile(file.url, 'Meta');

  return storeFile(orgId, {
    name: nameOf(file),
    contentType: blob.type || 'application/octet-stream',
    bytes: await blob.bytes(),
  });
};

const Payload = z.object({ messageId: z.string() });

/**
 * Copies a message's files from Meta's CDN to core's storage and points the message at each copy
 * as it lands, so a retry starts where the last try stopped. A file Meta or core refuses, such as
 * one over the organisation's size limit, keeps its link, which works until it expires. Any other
 * failure throws, so core tries again.
 */
export const copyMetaFiles = async (job: PluginJobDelivery) => {
  const { messageId } = Payload.parse(job.payload);

  const [found] = await withOrg(job.orgId, (tx) =>
    tx
      .select({ attachments: messages.attachments })
      .from(messages)
      .where(eq(messages.id, messageId)),
  );

  let attachments = found?.attachments ?? [];

  await inOrder(attachments.filter(onMetaCdn), async (file) => {
    const copy = await copyOf(job.orgId, file).catch((error: unknown) => {
      if (!(error instanceof FileRefused)) throw error;

      logger.warn({ err: error, messageId, file: file.name }, 'Meta file not copied, link kept');

      return null;
    });

    if (!copy) return;

    attachments = attachments.map((kept) => (kept === file ? copy : kept));

    await withOrg(job.orgId, (tx) =>
      tx.update(messages).set({ attachments }).where(eq(messages.id, messageId)),
    );
  });
};
