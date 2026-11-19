// What each organisation connected at a provider: Facebook pages, Instagram accounts, Discord and
// Telegram bots, mailboxes, phone systems. Tokens and passwords stay out, so every imported account
// waits, marked broken, until a member connects it again; reconnecting refreshes the same row.
import type { Db, Document } from 'mongodb';
import { BotMenuItem, IceBreaker } from '../../../api/src/db/meta.ts';
import type { Context } from '../context.ts';
import { put, skip } from '../engine.ts';
import type { Step } from '../step.ts';
import { createdOf, docId, entriesOf, idOf, idsOf, textOf } from '../values.ts';

type Provider = 'facebook' | 'instagram' | 'telegram' | 'discord' | 'mail' | 'call' | 'callpro';

/** An old provider record's inbox integration: what an integration the main data lost becomes. */
export type ProviderInbox = { kind: Provider; name: string };

/** Old provider records by their inbox integration's id, for integrations only they still name. */
export const providerInboxes = new Map<string, ProviderInbox>();

const RECONNECT = 'Imported from old erxes without its tokens: connect it again';

const isEmail = (value: string | null): value is string =>
  value !== null && /^[^\s@]+@[^\s@]+$/.test(value);

type Account = {
  provider: Provider;
  externalId: string;
  name: string;
  config: Record<string, unknown>;
  createdBy: string | null;
  created: unknown;
};

/**
 * Queues an account once per provider id, merged into one the target has, and remembers it as
 * the account of `inboxId`, the old integration it served.
 */
const accountRow = (ctx: Context, sourceId: string, inboxId: string | null, account: Account) => {
  const key = `${account.provider}:${account.externalId}`;
  const known = ctx.known('account.key', key);

  if (inboxId) {
    ctx.remember('account', inboxId, known ?? sourceId);
    providerInboxes.set(inboxId, { kind: account.provider, name: account.name });
  }

  // `known` is this record's own id on a second run, which inserts nothing again.
  if (known && known !== sourceId)
    return skip('merged into the account of the same page, bot, mailbox or phone');

  ctx.remember('account.key', key, sourceId);

  return put([
    'frontline_integration_accounts',
    {
      id: sourceId,
      provider: account.provider,
      external_id: account.externalId,
      name: account.name.slice(0, 200),
      config: account.config,
      secret: '',
      status: 'broken',
      error: RECONNECT,
      created_by: ctx.user(account.createdBy) ?? ctx.owner,
      created_at: createdOf({ _id: sourceId }, account.created),
    },
  ]);
};

/** The name each old integration had, to name the account it served. */
const integrationNames = new Map<string, string>();

const loadNames = async (ctx: Context) => {
  for (const db of [ctx.main, ctx.office])
    for await (const doc of db.collection('integrations').find({}, { projection: { name: 1 } }))
      integrationNames.set(String(docId(doc)), textOf(doc.name) ?? '');
};

const nameOf = (inboxId: string | null, fallback: string) =>
  (inboxId ? integrationNames.get(inboxId) : undefined) || fallback;

type AccountSource = {
  collection: string;
  account: (
    doc: Document,
  ) => (Omit<Account, 'name'> & { name: string; inboxId: string | null }) | null;
};

const SOURCES: AccountSource[] = [
  {
    collection: 'facebook_integrations',
    account: (doc) => {
      const [pageId] = idsOf(doc.facebookPageIds);
      const inboxId = idOf(doc.erxesApiId);

      return pageId
        ? {
            provider: 'facebook',
            externalId: pageId,
            name: nameOf(inboxId, `Facebook page ${pageId}`),
            config: {},
            createdBy: null,
            created: null,
            inboxId,
          }
        : null;
    },
  },
  {
    collection: 'instagram_integrations',
    account: (doc) => {
      const accountId = idOf(doc.instagramPageId);
      const inboxId = idOf(doc.erxesApiId);

      return accountId
        ? {
            provider: 'instagram',
            externalId: accountId,
            name: nameOf(inboxId, `Instagram ${accountId}`),
            config: { pageId: idOf(doc.facebookPageId) ?? '', username: '' },
            createdBy: null,
            created: null,
            inboxId,
          }
        : null;
    },
  },
  {
    collection: 'discord_bots',
    account: (doc) => {
      const applicationId = idOf(doc.applicationId);
      const health = entriesOf(doc.health);

      // A Discord bot's user id is its application's id.
      return applicationId
        ? {
            provider: 'discord',
            externalId: applicationId,
            name: textOf(health.get('botUsername')) ?? textOf(doc.name) ?? 'Discord bot',
            config: { applicationId },
            createdBy: null,
            created: doc.createdAt,
            inboxId: idOf(doc.erxesApiId),
          }
        : null;
    },
  },
  {
    collection: 'telegram_bots',
    account: (doc) => {
      const botId = idOf(doc.botId);
      const username = textOf(doc.botUsername) ?? '';

      return botId
        ? {
            provider: 'telegram',
            externalId: botId,
            name: textOf(doc.botName) ?? username,
            config: { username },
            createdBy: idOf(doc.createdBy),
            created: doc.createdAt,
            inboxId: idOf(doc.erxesApiId),
          }
        : null;
    },
  },
  {
    collection: 'imap_integrations',
    account: (doc) => {
      const address =
        textOf(doc.user)?.toLowerCase() ?? textOf(doc.mainUser)?.toLowerCase() ?? null;

      const host = textOf(doc.host);
      const smtpHost = textOf(doc.smtpHost);
      const smtpPort = Number(doc.smtpPort) || 465;

      if (!isEmail(address)) return null;

      const config =
        host && smtpHost
          ? {
              imap: { host, port: 993, secure: true, user: address },
              smtp: { host: smtpHost, port: smtpPort, secure: smtpPort === 465, user: address },
            }
          : {};

      return {
        provider: 'mail',
        externalId: address,
        name: address,
        config,
        createdBy: null,
        created: null,
        inboxId: idOf(doc.inboxId),
      };
    },
  },
  {
    // Cloudflare email routing forwarded `forwardFrom` to `address`; the mailbox is `forwardFrom`.
    collection: 'mail_integrations',
    account: (doc) => {
      const address =
        textOf(doc.forwardFrom)?.toLowerCase() ?? textOf(doc.address)?.toLowerCase() ?? null;

      return isEmail(address)
        ? {
            provider: 'mail',
            externalId: address,
            name: textOf(doc.senderName) ?? address,
            config: {},
            createdBy: null,
            created: null,
            inboxId: idOf(doc.inboxId),
          }
        : null;
    },
  },
  {
    collection: 'calls_integrations',
    account: (doc) => {
      const host = textOf(doc.wsServer)?.toLowerCase() ?? null;
      const phone = textOf(doc.phone) ?? '';

      // Old erxes read every PBX's times at +08:00.
      return host
        ? {
            provider: 'call',
            externalId: host,
            name: nameOf(idOf(doc.inboxId), phone || host),
            config: {
              host,
              phone,
              timeZone: 'Asia/Ulaanbaatar',
              turnUrl: '',
              turnUsername: '',
              hasTurnPassword: false,
            },
            createdBy: null,
            created: null,
            inboxId: idOf(doc.inboxId),
          }
        : null;
    },
  },
  {
    collection: 'integrations_callpros',
    account: (doc) => {
      const phone = textOf(doc.phoneNumber);

      return phone
        ? {
            provider: 'callpro',
            externalId: phone,
            name: nameOf(idOf(doc.inboxId), phone),
            config: { phone },
            createdBy: null,
            created: null,
            inboxId: idOf(doc.inboxId),
          }
        : null;
    },
  },
];

const accountStep = (
  database: 'erxes' | 'erxes_office_integrations',
  source: AccountSource,
): Step => {
  const dbOf = (ctx: Context): Db => (database === 'erxes' ? ctx.main : ctx.officeIntegrations);

  return {
    source: `${database}.${source.collection}`,
    documents: async (ctx) => {
      if (integrationNames.size === 0) await loadNames(ctx);

      const existing = await ctx.keyed(
        'frontline_integration_accounts',
        "provider || ':' || external_id",
      );

      for (const [key, id] of existing)
        if (!ctx.known('account.key', key)) ctx.remember('account.key', key, id);

      return ctx.find(dbOf(ctx), source.collection);
    },
    transform: (doc, ctx) => {
      const id = docId(doc);
      const account = source.account(doc);

      if (!id || !account) return skip('no page, bot, mailbox or phone it connected');

      return accountRow(ctx, id, account.inboxId, account);
    },
  };
};

/** Nylas mailboxes kept no settings beyond the address the integration is named after. */
const nylasStep = (database: 'erxes' | 'erxes_office'): Step => ({
  source: `${database}.integrations.nylas`,
  documents: (ctx) =>
    ctx.find(database === 'erxes' ? ctx.main : ctx.office, 'integrations', {
      kind: { $regex: /^nylas-/ },
    }),
  transform: (doc, ctx) => {
    const id = docId(doc);
    const address = textOf(doc.name)?.toLowerCase() ?? null;

    if (!id || !isEmail(address)) return skip('named by no mail address');

    return accountRow(ctx, id, id, {
      provider: 'mail',
      externalId: address,
      name: address,
      config: {},
      createdBy: idOf(doc.createdUserId),
      created: doc.createdAt,
    });
  },
});

/** Old menu items: `{ _id, type: 'button' | 'link', text, link }`. */
const menuOf = (value: unknown) =>
  (Array.isArray(value) ? value : []).flatMap((item: unknown, index) => {
    const entry =
      item instanceof Object ? new Map(Object.entries(item)) : new Map<string, unknown>();

    const title = textOf(entry.get('text'))?.slice(0, 30);
    const url = textOf(entry.get('link'));

    const parsed = BotMenuItem.safeParse(
      url
        ? { id: `menu-${index}`, type: 'link', title, url }
        : { id: `menu-${index}`, type: 'postback', title },
    );

    return parsed.success ? [parsed.data] : [];
  });

const iceBreakersOf = (value: unknown) =>
  (Array.isArray(value) ? value : []).flatMap((item: unknown, index) => {
    const entry =
      item instanceof Object ? new Map(Object.entries(item)) : new Map<string, unknown>();

    const parsed = IceBreaker.safeParse({
      id: `ice-${index}`,
      question: textOf(entry.get('question'))?.slice(0, 80),
    });

    return parsed.success ? [parsed.data] : [];
  });

const botStep = (
  database: 'erxes' | 'erxes_office_integrations',
  collection: string,
  provider: 'facebook' | 'instagram',
): Step => ({
  source: `${database}.${collection}`,
  documents: (ctx) =>
    ctx.find(database === 'erxes' ? ctx.main : ctx.officeIntegrations, collection),
  transform: (doc, ctx) => {
    const id = docId(doc);
    const pageId = idOf(doc.pageId);
    const accountId = ctx.known('account.key', `${provider}:${pageId ?? ''}`);

    if (!id) return skip('no id');

    if (!accountId) return skip('its page is not an imported account');

    if (ctx.known('bot.account', accountId)) return skip('the page has a bot already');

    ctx.remember('bot.account', accountId, id);

    return put([
      'frontline_meta_bots',
      {
        id,
        account_id: accountId,
        name: textOf(doc.name) ?? 'Bot',
        persistent_menu: menuOf(doc.persistentMenus),
        ice_breakers: iceBreakersOf(doc.iceBreakers),
        get_started_text: textOf(doc.getStartedText),
        greeting: textOf(doc.greetText),
        status: 'broken',
        error: RECONNECT,
        created_by: ctx.user(idOf(doc.createdBy)) ?? ctx.owner,
        created_at: createdOf(doc, doc.createdAt),
        updated_at: createdOf(doc, doc.updatedAt, doc.createdAt),
      },
    ]);
  },
});

export const ACCOUNT_STEPS: Step[] = [
  ...SOURCES.map((source) => accountStep('erxes', source)),
  ...SOURCES.filter(({ collection }) =>
    ['facebook_integrations', 'instagram_integrations'].includes(collection),
  ).map((source) => accountStep('erxes_office_integrations', source)),
  nylasStep('erxes'),
  nylasStep('erxes_office'),
  botStep('erxes', 'facebook_messengers_bots', 'facebook'),
  botStep('erxes', 'instagram_bots', 'instagram'),
  botStep('erxes_office_integrations', 'facebook_messengers_bots', 'facebook'),
  botStep('erxes_office_integrations', 'instagram_messengers_bots', 'instagram'),
];
