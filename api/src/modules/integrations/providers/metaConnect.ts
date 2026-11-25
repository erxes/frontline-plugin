import type { DeliveredEvent } from '@erxes/plugin-sdk';
import { ORPCError } from '@orpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '#/config.ts';
import { core, PERMISSIONS, refusedByCore } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { integrationAccounts } from '#/db/integrations.ts';
import { readsWithCore, writesWithCore } from '#/orpc.ts';
import { recordCheck } from '../accounts.ts';
import { inOrder } from '../provider.ts';
import { providerOf } from './index.ts';
import { Account, checkInto, Into, metaKey, removeWebhookKeys, saveAccount } from '../store.ts';
import { subscribeToPage } from './meta.ts';
import { askMeta, graph } from './metaGraph.ts';
import { credentialsOf, FACEBOOK, FACEBOOK_SETTINGS, forgetConnection } from './metaConnection.ts';
import { routeThroughRelay } from './metaRelay.ts';

/** Core's event that a connection was added, changed, turned off or removed. */
export const CONNECTION_CHANGED = 'core.integration.changed';

/**
 * Core's refusal in words a member acts on: the owner hasn't approved frontline's use of the
 * organisation's Facebook connections, or the connection picked is gone.
 */
const askCore = <T>(call: Promise<T>) =>
  call.catch((error: unknown) => {
    if (error instanceof ORPCError && error.code === 'SCOPE_REQUIRED')
      throw new ORPCError('PRECONDITION_FAILED', {
        message:
          "Frontline may not use the organisation's Facebook connection yet: the owner approves it in Settings › Plugins",
      });

    if (refusedByCore(error))
      throw new ORPCError('BAD_REQUEST', {
        message:
          'That Facebook connection is gone or turned off: pick another, or connect Facebook in Settings › Integrations › Facebook',
      });

    throw error;
  });

/** The organisation's active Facebook connections in core, by name; never their tokens. */
const connections = readsWithCore(PERMISSIONS.integrationManage, z.object({}), async (member) =>
  askCore(core.forOrg(member.orgId).integrations.usable({ key: FACEBOOK })),
)
  .route({
    summary: "List your organization's active Facebook connections by name, without tokens",
  })
  .output(
    z.object({
      data: z.array(z.object({ id: z.string(), name: z.string() })),
      /** Core's page where an organisation connects Facebook, for when there is none. */
      settingsPath: z.string(),
    }),
  )
  .handler(({ context: { fromCore } }) => ({ ...fromCore, settingsPath: FACEBOOK_SETTINGS }));

const Pages = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      access_token: z.string(),
      instagram_business_account: z
        .object({ id: z.string(), username: z.string().optional() })
        .optional(),
    }),
  ),
});

type Page = z.infer<typeof Pages>['data'][number];

/** The page's account, and its linked Instagram account's, both on the page's token. */
const accountsOf = (page: Page) => {
  const secret = { pageToken: page.access_token };
  const linked = page.instagram_business_account;

  return [
    {
      provider: 'facebook' as const,
      externalId: page.id,
      name: page.name,
      config: {},
      secret,
      webhookKey: metaKey('facebook', page.id),
    },
    ...(linked
      ? [
          {
            provider: 'instagram' as const,
            externalId: linked.id,
            name: linked.username ? `@${linked.username}` : page.name,
            config: { pageId: page.id, username: linked.username },
            secret,
            webhookKey: metaKey('instagram', linked.id),
          },
        ]
      : []),
  ];
};

/**
 * Subscribes the app to the page's events, and has meta-relay route the page and its Instagram
 * account here when the app is the install's, which the relay forwards. An organisation's own
 * app posts to its own webhook address.
 */
const subscribe = async (page: Page) => {
  const accounts = accountsOf(page);
  const appId = await subscribeToPage(page.id, page.access_token);

  if (appId === config.meta.appId)
    await Promise.all(
      accounts.map((account) => routeThroughRelay(account.provider, account.externalId)),
    );

  return accounts;
};

/**
 * Connects every page the organisation's Facebook connection manages, with its own token, and
 * the Instagram account linked to each. Core gives the connection's token (`credentials`), used
 * once and never stored. Meta and meta-relay are asked before the transaction opens, so a
 * refusal saves nothing; each account records the connection, whose app checks its webhooks.
 * Pages connected before are refreshed and linked to it. Started from a channel, they join it.
 */
const connect = writesWithCore(
  PERMISSIONS.integrationManage,
  z.object({ connectionId: z.string().min(1), ...Into }),
  async (member, input) => {
    await checkInto(member, input.channelId);

    const { accessToken } = await askCore(credentialsOf(member.orgId, input.connectionId));

    const pages = Pages.parse(
      await askMeta(
        graph('me/accounts', accessToken, {
          query: {
            fields: 'id,name,access_token,instagram_business_account{id,username}',
            limit: '100',
          },
        }),
      ),
    ).data;

    if (pages.length === 0)
      throw new ORPCError('BAD_REQUEST', {
        message: 'The Facebook connection manages no pages: grant it a page in Facebook first',
      });

    return (await askMeta(Promise.all(pages.map(subscribe)))).flat();
  },
)
  .route({
    summary:
      'Connect every page a Facebook connection manages and their linked Instagram accounts, optionally to a channel',
  })
  .output(z.object({ accounts: z.array(Account) }))
  .handler(async ({ input, context: { tx, member, fromCore } }) => ({
    accounts: await inOrder(fromCore, (account) =>
      saveAccount(tx, member, { ...account, connectionId: input.connectionId }, input.channelId),
    ),
  }));

export const metaConnectProcedures = { connections, connect };

const Changed = z.object({ key: z.string(), connectionId: z.string(), change: z.string() });

/** What turns a connection's accounts off: core removed the connection, or turned it off. */
const STOPPED: Record<string, string> = {
  removed: 'was removed',
  disabled: 'was turned off',
};

/**
 * Follows core's `core.integration.changed` for a Facebook connection: its app is read again on
 * next use. Once removed or turned off, its pages and Instagram accounts stop: their webhook keys
 * go, meta-relay stops routing them here, and they show broken until a member connects them
 * again. A connection added or turned on does nothing until a member picks it. Resolves to how
 * many accounts stopped.
 */
export const followConnection = async ({ organizationId: orgId, data }: DeliveredEvent) => {
  const changed = Changed.safeParse(data.payload);

  if (!changed.success || changed.data.key !== FACEBOOK) return 0;

  const { connectionId, change } = changed.data;

  forgetConnection(connectionId);

  const stopped = STOPPED[change];

  if (!stopped) return 0;

  const rows = await withOrg(orgId, async (tx) => {
    const found = await tx
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.connectionId, connectionId));

    if (found.length)
      await removeWebhookKeys(
        tx,
        orgId,
        found.map((row) => row.id),
      );

    return found;
  });

  await Promise.all(
    rows.map(async (row) => {
      await recordCheck(
        row,
        `Its Facebook connection in erxes ${stopped}: connect it again through erxes's Facebook connection`,
      );
      await providerOf(row.provider).open(row).disconnect();
    }),
  );

  return rows.length;
};
