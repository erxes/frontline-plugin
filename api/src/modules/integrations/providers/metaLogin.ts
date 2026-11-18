import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { config } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { writes } from '#/orpc.ts';
import { readToken, signToken } from '../../tokens.ts';
import { inOrder } from '../provider.ts';
import { Into, intoChannel, metaKey, saveAccount } from '../store.ts';
import { GRAPH_VERSION, graph, subscribeToPage } from './meta.ts';
import { type MetaApp, metaAppIn, metaAppOf, metaCallbackUrl } from './metaApp.ts';
import { routeThroughRelay } from './metaRelay.ts';

const STATE = 'meta login';

/**
 * What the pages need: Messenger and Instagram messages, comments and replies to them, posts,
 * and the page list to pick from.
 */
const SCOPES = [
  'pages_show_list',
  'pages_messaging',
  'pages_manage_metadata',
  'pages_read_engagement',
  'pages_read_user_content',
  'pages_manage_engagement',
  'pages_manage_posts',
  'business_management',
  'instagram_basic',
  'instagram_manage_messages',
  'instagram_manage_comments',
];

const State = z.object({ orgId: z.string(), userId: z.string(), ...Into });

/** Where Meta's login returns the member: the Facebook and Instagram settings in web. */
export const SETTINGS_URL = `${config.coreUiOrigin}/frontline/settings/integrations`;

/**
 * The address of Meta's login dialog, where the member picks the pages and Instagram accounts to
 * connect. Meta sends them back to `/api/public/webhooks/meta/callback` with a state only frontline
 * signs, good for 10 minutes. Started from a channel, the state names it, and every page and
 * account the member grants joins it.
 */
const loginUrl = writes(PERMISSIONS.integrationManage)
  .input(z.object(Into).optional())
  .output(z.object({ url: z.string() }))
  .handler(async ({ input, context: { tx, member } }) => {
    const app = await metaAppIn(tx, member.orgId);

    if (!app)
      throw new ORPCError('PRECONDITION_FAILED', {
        message:
          'Set your Meta app in Settings › Integrations › Meta to connect Facebook and Instagram',
      });

    const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);

    url.searchParams.set('client_id', app.appId);
    url.searchParams.set('redirect_uri', metaCallbackUrl());
    url.searchParams.set('scope', SCOPES.join(','));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set(
      'state',
      await signToken(
        STATE,
        {
          orgId: member.orgId,
          userId: member.userId,
          channelId: await intoChannel(tx, member, input?.channelId),
        },
        '10m',
      ),
    );

    return { url: url.toString() };
  });

export const metaProcedures = { loginUrl };

const Token = z.object({ access_token: z.string() });

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

/** A long-lived user token from the login's code: page tokens made from it don't expire. */
const userTokenOf = async (code: string, { appId, appSecret }: MetaApp) => {
  const short = Token.parse(
    await graph('oauth/access_token', null, {
      query: { client_id: appId, client_secret: appSecret, redirect_uri: metaCallbackUrl(), code },
    }),
  );

  return Token.parse(
    await graph('oauth/access_token', null, {
      query: {
        grant_type: 'fb_exchange_token',
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: short.access_token,
      },
    }),
  ).access_token;
};

/**
 * Meta's login comes back here with a code. Every page the member granted is connected with its
 * own token and subscribed to the app's webhook, and so is the Instagram account linked to it.
 * With meta-relay set, each is routed through it too. The user token is used once and never
 * stored.
 */
export const connectMetaPages = async (code: string, stateToken: string) => {
  const state = await readToken(STATE, stateToken, State);

  if (!state) throw new ORPCError('UNAUTHORIZED', { message: 'The login expired: connect again' });

  const app = await metaAppOf(state.orgId);

  if (!app) throw new ORPCError('PRECONDITION_FAILED', { message: 'The Meta app was removed' });

  const pages = Pages.parse(
    await graph('me/accounts', await userTokenOf(code, app), {
      query: { fields: 'id,name,access_token,instagram_business_account{id,username}' },
    }),
  ).data;

  const accounts = pages.flatMap((page) => {
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
  });

  // Meta and meta-relay first, so a refusal saves nothing and the member sees why. The relay
  // forwards the install's app only; an organisation's own app posts here directly.
  await Promise.all([
    ...pages.map((page) => subscribeToPage(page.id, page.access_token)),
    ...(app.own
      ? []
      : accounts.map((account) => routeThroughRelay(account.provider, account.externalId))),
  ]);

  await withOrg(state.orgId, (tx) =>
    inOrder(accounts, (account) => saveAccount(tx, state, account, state.channelId)),
  );

  return pages.length;
};
