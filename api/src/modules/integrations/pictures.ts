import type { PluginJobDelivery } from '@erxes/core-contract';
import { enqueueJob } from '@erxes/plugin-sdk';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { core, JOBS, refusedByCore } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { customerLinks } from '#/db/inbox.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { logger } from '#/logger.ts';
import { downloadFile, FileRefused, storeFile } from '../files.ts';
import { AccountRefused, type AccountRow, inOrder } from './provider.ts';
import { ProviderRefused } from './providerApi.ts';
import { providerOf } from './providers/index.ts';

/**
 * Has a job copy the profile picture of each of `externalIds` the account's provider shows, once
 * per person: a new customer's, and an earlier one's when they next write.
 */
export const askPictures = async (row: AccountRow, externalIds: string[]) => {
  if (!externalIds.length || !providerOf(row.provider).open(row).pictureOf) return;

  await withOrg(row.orgId, async (tx) => {
    const asked = await tx
      .update(customerLinks)
      .set({ pictureAskedAt: sql`now()` })
      .where(
        and(
          eq(customerLinks.source, row.provider),
          inArray(customerLinks.externalId, externalIds),
          isNull(customerLinks.pictureAskedAt),
        ),
      )
      .returning({ externalId: customerLinks.externalId });

    await inOrder(asked, ({ externalId }) =>
      enqueueJob(tx, {
        orgId: row.orgId,
        name: JOBS.customerPicture.name,
        payload: { accountId: row.id, externalId },
      }),
    );
  });
};

/**
 * A refusal a later try won't change: a token the provider no longer takes, or any 4xx but a
 * timeout or too many requests.
 */
const refusedForGood = (error: unknown) =>
  error instanceof AccountRefused ||
  error instanceof FileRefused ||
  (error instanceof ProviderRefused &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429) ||
  refusedByCore(error);

const Payload = z.object({ accountId: z.string(), externalId: z.string() });

/** The account and the core customer the person is linked to now, or null for either gone. */
const linkedOf = (orgId: string, { accountId, externalId }: z.infer<typeof Payload>) =>
  withOrg(orgId, async (tx) => {
    const [account] = await tx
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, accountId));

    if (!account) return null;

    const [link] = await tx
      .select({ customerId: customerLinks.customerId })
      .from(customerLinks)
      .where(
        and(eq(customerLinks.source, account.provider), eq(customerLinks.externalId, externalId)),
      );

    return link ? { account, customerId: link.customerId } : null;
  });

/** The picture at `url`, stored in core's storage as the organisation's file. */
const storePicture = async (orgId: string, url: string, from: string) => {
  const blob = await downloadFile(url, from);
  const contentType = blob.type || 'image/jpeg';

  return storeFile(orgId, {
    name: `profile.${contentType.split('/')[1] ?? 'jpg'}`,
    contentType,
    bytes: await blob.bytes(),
  });
};

/**
 * Sets the provider's profile picture of a customer as their avatar in core, copied to core's
 * storage since the provider's link expires. A customer who has an avatar keeps it. A refusal that
 * a retry won't change, such as a page without access to profiles or a picture over the size
 * limit, is logged and leaves the customer without one; anything else throws, so core tries again.
 */
export const copyPicture = async (job: PluginJobDelivery) => {
  const payload = Payload.parse(job.payload);
  const linked = await linkedOf(job.orgId, payload);

  if (!linked) return;

  const { account, customerId } = linked;
  const customers = core.forOrg(job.orgId).customers;

  try {
    const customer = await customers.get({ id: customerId });

    if (customer.avatarUrl) return;

    const url = await providerOf(account.provider).open(account).pictureOf?.(payload.externalId);

    if (!url) return;

    const picture = await storePicture(job.orgId, url, account.provider);

    await customers.update({ id: customerId, avatarUrl: picture.url });
  } catch (error) {
    if (!refusedForGood(error)) throw error;

    logger.warn(
      { err: error, accountId: account.id, customerId },
      'profile picture not copied, the customer keeps none',
    );
  }
};
