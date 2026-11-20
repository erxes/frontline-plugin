import type { PluginJobDelivery } from '@erxes/core-contract';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withOrg } from '#/db/client.ts';
import { customerLinks, integrations } from '#/db/inbox.ts';
import { META_KINDS, metaAccounts, metaApps, metaBots } from '#/db/meta.ts';
import { logger } from '#/logger.ts';
import { inOrder } from '../provider.ts';
import { openSecret } from '../secrets.ts';
import { connectionsOf, metaOf } from './meta.ts';

const PageToken = z.object({ pageToken: z.string() });

const AppSecret = z.object({ appSecret: z.string() });

const InstagramConfig = z.object({ pageId: z.string(), username: z.string().optional() });

const PEOPLE_AT_ONCE = 1000;

const CONNECTIONS_AT_ONCE = 200;

const keyOf = (kind: string, externalId: string) => `${kind}:${externalId}`;

const stored = (orgId: string) =>
  withOrg(orgId, async (tx) => {
    const [app] = await tx.select().from(metaApps);

    return {
      app,
      accounts: await tx.select().from(metaAccounts),
      people: await tx
        .select({
          kind: sql<(typeof META_KINDS)[number]>`${customerLinks.source}`,
          externalId: customerLinks.externalId,
          customerId: customerLinks.customerId,
        })
        .from(customerLinks)
        .where(inArray(customerLinks.source, META_KINDS)),
    };
  });

const chunked = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, at) =>
    items.slice(at * size, at * size + size),
  );

export const importMeta = async (job: PluginJobDelivery) => {
  const { orgId } = job;
  const { app, accounts, people } = await stored(orgId);

  if (!app && !accounts.length && !people.length) return { imported: 0 };

  const known = new Set(
    (await connectionsOf(orgId)).map((connection) => keyOf(connection.kind, connection.externalId)),
  );

  const connections = accounts
    .filter((account) => !known.has(keyOf(account.kind, account.externalId)))
    .map((account) => {
      const instagram =
        account.kind === 'instagram' ? InstagramConfig.parse(account.config) : undefined;

      return {
        kind: account.kind,
        externalId: account.externalId,
        pageId: instagram?.pageId ?? account.externalId,
        name: account.name,
        username: instagram?.username ?? null,
        pageToken: openSecret(orgId, account.secret, PageToken).pageToken,
        app: app ? ('own' as const) : ('install' as const),
        status: account.status === 'broken' ? ('broken' as const) : ('healthy' as const),
        statusReason: account.error,
        connectedBy: account.createdBy,
      };
    });

  const meta = metaOf(orgId);

  const moved = await meta.import({
    app: app && {
      appId: app.appId,
      appSecret: openSecret(orgId, app.secret, AppSecret).appSecret,
      verifyToken: app.verifyToken,
    },
  });

  await inOrder(chunked(connections, CONNECTIONS_AT_ONCE), (batch) =>
    meta.import({ connections: batch }),
  );
  await inOrder(chunked(people, PEOPLE_AT_ONCE), (batch) => meta.import({ people: batch }));

  const connectionIds = new Map(
    (await connectionsOf(orgId)).map((connection) => [
      keyOf(connection.kind, connection.externalId),
      connection.id,
    ]),
  );

  await withOrg(orgId, async (tx) => {
    await inOrder(accounts, async (account) => {
      const connectionId = connectionIds.get(keyOf(account.kind, account.externalId));

      if (!connectionId)
        throw new Error(`Core kept no connection for ${account.kind} ${account.externalId}`);

      await tx
        .update(integrations)
        .set({ config: { connectionId } })
        .where(
          and(
            eq(integrations.kind, account.kind),
            sql`${integrations.config} ->> 'accountId' = ${account.id}`,
          ),
        );
      await tx.update(metaBots).set({ connectionId }).where(eq(metaBots.connectionId, account.id));
    });

    await tx.delete(metaAccounts);
    await tx.delete(metaApps);
    await tx.delete(customerLinks).where(inArray(customerLinks.source, META_KINDS));
  });

  logger.info(
    {
      orgId,
      connections: accounts.length,
      people: people.length,
      app: Boolean(app),
      automations: moved.automations,
      placeholdersLeft: moved.placeholdersLeft,
      stepsLeft: moved.stepsLeft,
    },
    'Meta handed to core',
  );

  return { imported: accounts.length };
};
