import { ORPCError } from '@orpc/server';
import { z } from 'zod';
import { config } from '#/config.ts';
import { PERMISSIONS } from '#/core.ts';
import { withOrg } from '#/db/client.ts';
import { writes } from '#/orpc.ts';
import { inOrder } from '../provider.ts';
import { metaKey, saveAccount } from '../store.ts';
import { readToken, signToken } from '../secrets.ts';
import { GRAPH_VERSION, graph } from './meta.ts';

const STATE = 'meta-login';

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

/** The events Meta posts to frontline for a connected page. */
const PAGE_FIELDS = ['messages', 'messaging_postbacks', 'message_reactions', 'feed'];

const State = z.object({ orgId: z.string(), userId: z.string() });

const callbackUrl = () => `${config.publicUrl}/api/public/webhooks/meta/callback`;

/** Where Meta's login returns the member: the Facebook and Instagram settings in web. */
export const SETTINGS_URL = `${config.coreUiOrigin}/frontline/settings/integrations`;

/**
 * The address of Meta's login dialog, where the member picks the pages and Instagram accounts to
 * connect. Meta sends them back to `/api/public/webhooks/meta/callback` with a state only frontline
 * signs, good for 10 minutes.
 */
const loginUrl = writes(PERMISSIONS.integrationManage)
  .output(z.object({ url: z.string() }))
  .handler(async ({ context: { member } }) => {
    if (!config.meta.appId || !config.meta.appSecret)
      throw new ORPCError('PRECONDITION_FAILED', {
        message: 'Set META_APP_ID and META_APP_SECRET to connect Facebook and Instagram',
      });

    const url = new URL(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`);

    url.searchParams.set('client_id', config.meta.appId);
    url.searchParams.set('redirect_uri', callbackUrl());
    url.searchParams.set('scope', SCOPES.join(','));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set(
      'state',
      await signToken(STATE, { orgId: member.orgId, userId: member.userId }, '10m'),
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
const userTokenOf = async (code: string) => {
  const appId = config.meta.appId ?? '';
  const appSecret = config.meta.appSecret ?? '';

  const short = Token.parse(
    await graph('oauth/access_token', null, {
      query: { client_id: appId, client_secret: appSecret, redirect_uri: callbackUrl(), code },
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
 * The user token is used once and never stored.
 */
export const connectMetaPages = async (code: string, stateToken: string) => {
  const state = await readToken(STATE, stateToken, State);

  if (!state) throw new ORPCError('UNAUTHORIZED', { message: 'The login expired: connect again' });

  const pages = Pages.parse(
    await graph('me/accounts', await userTokenOf(code), {
      query: { fields: 'id,name,access_token,instagram_business_account{id,username}' },
    }),
  ).data;

  await Promise.all(
    pages.map((page) =>
      graph(`${page.id}/subscribed_apps`, page.access_token, {
        method: 'POST',
        query: { subscribed_fields: PAGE_FIELDS.join(',') },
      }),
    ),
  );

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

  await withOrg(state.orgId, (tx) =>
    inOrder(accounts, (account) => saveAccount(tx, state, account)),
  );

  return pages.length;
};
