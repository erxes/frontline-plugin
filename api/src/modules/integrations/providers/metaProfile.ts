import type { MetaKind } from '@erxes/core-contract';
import type { metaBots } from '#/db/meta.ts';
import { graph } from './meta.ts';

type Connection = { orgId: string; id: string; kind: MetaKind };

type Bot = Pick<
  typeof metaBots.$inferSelect,
  'id' | 'persistentMenu' | 'iceBreakers' | 'getStartedText' | 'greeting'
>;

/** What a tap sends back in a postback's payload: the bot and the item tapped. */
const payloadOf = (botId: string, itemId?: string) => JSON.stringify({ botId, itemId });

/** The Messenger profile fields frontline sets, so a removed bot clears them all. */
const FIELDS = ['get_started', 'persistent_menu', 'greeting', 'ice_breakers'];

/** Instagram's profile has a persistent menu and ice breakers only. */
const fieldsOf = (provider: MetaKind) =>
  provider === 'instagram' ? ['persistent_menu', 'ice_breakers'] : FIELDS;

const queryOf = (provider: MetaKind): Record<string, string> =>
  provider === 'instagram' ? { platform: 'instagram' } : {};

/** The profile Meta stores for `bot`, with the fields it leaves empty. */
const profileOf = (provider: MetaKind, bot: Bot) => {
  const getStarted = {
    type: 'postback',
    title: bot.getStartedText || 'Get started',
    payload: payloadOf(bot.id),
  };

  const menu = [
    ...(provider === 'facebook' && bot.persistentMenu.length ? [getStarted] : []),
    ...bot.persistentMenu.map((item) =>
      item.type === 'link'
        ? { type: 'web_url', title: item.title, url: item.url, webview_height_ratio: 'full' }
        : { type: 'postback', title: item.title, payload: payloadOf(bot.id, item.id) },
    ),
  ];

  const profile: Record<string, unknown> = {
    ...(provider === 'facebook' ? { get_started: { payload: payloadOf(bot.id) } } : {}),
    ...(menu.length
      ? {
          persistent_menu: [
            { locale: 'default', composer_input_disabled: false, call_to_actions: menu },
          ],
        }
      : {}),
    ...(provider === 'facebook' && bot.greeting
      ? { greeting: [{ locale: 'default', text: bot.greeting }] }
      : {}),
    ...(bot.iceBreakers.length
      ? {
          ice_breakers: [
            {
              locale: 'default',
              call_to_actions: bot.iceBreakers.map((item) => ({
                question: item.question,
                payload: payloadOf(bot.id, item.id),
              })),
            },
          ],
        }
      : {}),
  };

  return { profile, cleared: fieldsOf(provider).filter((field) => !(field in profile)) };
};

/**
 * Sets the bot's profile on the page or Instagram account. A field left out of Meta's POST keeps
 * its old value, so an emptied one is deleted.
 */
export const pushProfile = async ({ orgId, id, kind }: Connection, bot: Bot) => {
  const { profile, cleared } = profileOf(kind, bot);

  if (Object.keys(profile).length)
    await graph(orgId, id, 'me/messenger_profile', {
      method: 'POST',
      query: queryOf(kind),
      body: profile,
    });

  if (cleared.length)
    await graph(orgId, id, 'me/messenger_profile', {
      method: 'DELETE',
      query: queryOf(kind),
      body: { fields: cleared },
    });
};

/** Clears every profile field frontline set, for a bot that is being removed. */
export const clearProfile = ({ orgId, id, kind }: Connection) =>
  graph(orgId, id, 'me/messenger_profile', {
    method: 'DELETE',
    query: queryOf(kind),
    body: { fields: fieldsOf(kind) },
  });
