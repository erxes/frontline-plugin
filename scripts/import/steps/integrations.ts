// Old integrations become `frontline_integrations` of the adapter that now does their job. Lead
// integrations are forms (steps/forms.ts). Kinds with no adapter stay out and are listed.
import type { Document } from 'mongodb';
import { MessengerConfig } from '../../../api/src/modules/messenger/adapter.ts';
import type { Context } from '../context.ts';
import { put, skip } from '../engine.ts';
import type { Step } from '../step.ts';
import { boolOf, createdOf, entriesOf, idOf, idsOf, textOf, docId } from '../values.ts';
import { providerInboxes } from './accounts.ts';
import { already, FALLBACK_CHANNEL } from './structure.ts';

/** Old kinds and the adapter each became. */
const KINDS: Record<string, string> = {
  messenger: 'messenger',
  'facebook-messenger': 'facebook',
  'facebook-post': 'facebook',
  'instagram-messenger': 'instagram',
  'instagram-post': 'instagram',
  'discord-messenger': 'discord',
  'telegram-messenger': 'telegram',
  mail: 'mail',
  imap: 'mail',
  'nylas-imap': 'mail',
  'nylas-gmail': 'mail',
  'nylas-office365': 'mail',
  'nylas-outlook': 'mail',
  'nylas-yahoo': 'mail',
  calls: 'call',
  callpro: 'callpro',
};

/** Old kinds that are forms, not inbox integrations. */
const FORM_KINDS = new Set(['lead', 'booking']);

/** `9:00 AM` or `18:30` as `09:00`. */
const timeOf = (value: unknown) => {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(textOf(value) ?? '');

  if (!match) return null;

  const [, hours = '0', minutes = '00', half] = match;
  const hour = (Number(hours) % 12) + (half?.toUpperCase() === 'PM' ? 12 : 0);

  return `${String(half ? hour : Number(hours)).padStart(2, '0')}:${minutes}`;
};

const DAYS: Record<string, string> = { weekends: 'weekend' };

const RESPONSE_RATES: Record<string, string> = {
  'A few minutes': 'minutes',
  'A few hours': 'hours',
  'A day': 'days',
};

type MessengerApp = { kind: string; credentials: Map<string, unknown> };

/** Old messenger apps by their messenger's id: the knowledge base topic and website buttons. */
const messengerApps = new Map<string, MessengerApp[]>();

const loadApps = async (ctx: Context) => {
  for await (const doc of ctx.main.collection('messenger_apps').find()) {
    const credentials = entriesOf(doc.credentials);
    const integrationId = idOf(credentials.get('integrationId'));

    if (integrationId)
      messengerApps.set(integrationId, [
        ...(messengerApps.get(integrationId) ?? []),
        { kind: String(doc.kind), credentials },
      ]);
  }
};

/** A messenger's settings from its old `messengerData`, `uiOptions`, language and apps. */
export const messengerConfigOf = (
  doc: Document,
  ctx: Pick<Context, 'users'>,
  apps: MessengerApp[] = [],
) => {
  const data = entriesOf(doc.messengerData);
  const ui = entriesOf(doc.uiOptions);
  const language = textOf(doc.languageCode) ?? 'en';
  const messages = entriesOf(data.get('messages'));
  const text = entriesOf(messages.get(language) ?? messages.get('en'));
  const greetings = entriesOf(text.get('greetings'));
  const links = [...entriesOf(data.get('links')).values()].flatMap((link) => textOf(link) ?? []);
  const topic = apps.find((app) => app.kind === 'knowledgebase');

  const onlineHours: unknown = data.get('onlineHours');

  const hours = (Array.isArray(onlineHours) ? onlineHours : []).flatMap((row: unknown) => {
    const hour = entriesOf(row);
    const day = textOf(hour.get('day'));
    const from = timeOf(hour.get('from'));
    const to = timeOf(hour.get('to'));

    return day && from && to ? [{ day: DAYS[day] ?? day, from, to }] : [];
  });

  const config = {
    welcome: (textOf(text.get('welcome')) ?? '').slice(0, 1000),
    away: (textOf(text.get('away')) ?? '').slice(0, 1000),
    thank: (textOf(text.get('thank')) ?? '').slice(0, 1000),
    greetingTitle: (textOf(greetings.get('title')) ?? '').slice(0, 200),
    greetingMessage: (textOf(greetings.get('message')) ?? '').slice(0, 1000),
    supporterIds: ctx.users(idsOf(data.get('supporterIds'))).slice(0, 10),
    links: links.filter((link) => /^https?:\/\//.test(link)).slice(0, 10),
    color: textOf(ui.get('color')) ?? undefined,
    textColor: textOf(ui.get('textColor')) ?? undefined,
    logo: textOf(ui.get('logo')),
    availability: data.get('availabilityMethod') === 'auto' ? 'auto' : 'manual',
    isOnline: boolOf(data.get('isOnline')) ?? true,
    onlineHours: hours.slice(0, 20),
    timezone: textOf(data.get('timezone')),
    showTimezone: boolOf(data.get('showTimezone')) ?? false,
    responseRate: RESPONSE_RATES[String(data.get('responseRate'))] ?? 'minutes',
    hideWhenOffline: boolOf(data.get('hideWhenOffline')) ?? false,
    language: language.slice(0, 10),
    requireAuth: boolOf(data.get('requireAuth')) ?? false,
    showChat: boolOf(data.get('showChat')) ?? true,
    showLauncher: boolOf(data.get('showLauncher')) ?? true,
    forceLogoutWhenResolve: boolOf(data.get('forceLogoutWhenResolve')) ?? false,
    knowledgeBaseTopicId: topic ? textOf(topic.credentials.get('topicId')) : null,
    websiteApps: apps
      .filter((app) => app.kind === 'website')
      .map((app) => ({
        url: textOf(app.credentials.get('url')),
        buttonText: textOf(app.credentials.get('buttonText')),
        description: textOf(app.credentials.get('description')) ?? '',
      }))
      .filter((app) => app.url && app.buttonText)
      .slice(0, 10),
  };

  // A value the new settings don't take (a colour name, an unknown time zone) falls back to its
  // default rather than losing the whole messenger.
  const parsed = MessengerConfig.safeParse(config);

  if (parsed.success) return parsed.data;

  const bad = new Set(parsed.error.issues.map((issue) => String(issue.path[0])));

  return MessengerConfig.parse(
    Object.fromEntries(Object.entries(config).filter(([key]) => !bad.has(key))),
  );
};

/** Old channels listed their integrations; 2.x integrations had no `channelId` of their own. */
const channelOfIntegration = new Map<string, string>();

const loadChannels = async (ctx: Context) => {
  for (const db of [ctx.office, ctx.main])
    for await (const doc of db
      .collection('channels')
      .find({}, { projection: { integrationIds: 1 } }))
      for (const integrationId of idsOf(doc.integrationIds))
        channelOfIntegration.set(integrationId, String(docId(doc)));
};

/** The channel an old integration's records go to: its own, its old channel's, or the fallback. */
const channelFor = (ctx: Context, doc: Document) =>
  ctx.known('channel', idOf(doc.channelId)) ??
  ctx.known('channel', channelOfIntegration.get(String(docId(doc))) ?? null) ??
  FALLBACK_CHANNEL;

type Planned = { id: string; kind: string; channelId: string; config: Record<string, unknown> };

/** Where an old integration goes, or why it stays out. */
const planOf = (doc: Document, ctx: Context): Planned | string => {
  const id = docId(doc);
  const kind = KINDS[String(doc.kind)];

  if (!id) return 'no id';

  if (FORM_KINDS.has(String(doc.kind))) {
    ctx.remember('lead', id, channelFor(ctx, doc));

    return 'a lead form: imported as a form';
  }

  // Its conversations stay out with it, for the same reason.
  const leftOut = (reason: string) => {
    ctx.remember('integration.left-out', id, reason);

    return reason;
  };

  if (!kind) return leftOut(`no adapter for ${String(doc.kind)} in the new Frontline`);

  const channelId = channelFor(ctx, doc);

  if (kind === 'messenger')
    return { id, kind, channelId, config: messengerConfigOf(doc, ctx, messengerApps.get(id)) };

  const accountId = ctx.known('account', id);

  if (!accountId) return leftOut('its page, bot, mailbox or phone is not in the old data');

  return {
    id,
    kind,
    channelId,
    config: { accountId, ...(kind === 'call' || kind === 'callpro' ? { queues: [] } : {}) },
  };
};

/** Queues an integration, or merges a second one of the same account and channel into the first. */
const integrationRow = (ctx: Context, plan: Planned, row: Record<string, unknown>) => {
  const accountKey =
    typeof plan.config.accountId === 'string' ? `${plan.config.accountId}|${plan.channelId}` : null;

  const sibling = accountKey ? ctx.known('integration.account', accountKey) : undefined;

  if (sibling && sibling !== plan.id) {
    ctx.remember('integration', plan.id, sibling);
    ctx.integrations.set(plan.id, { id: sibling, channelId: plan.channelId, kind: plan.kind });

    return skip(
      'merged into the integration of the same account and channel (Messenger and posts of one page)',
    );
  }

  if (accountKey) ctx.remember('integration.account', accountKey, plan.id);

  ctx.remember('integration', plan.id, plan.id);
  ctx.integrations.set(plan.id, { id: plan.id, channelId: plan.channelId, kind: plan.kind });

  return put([
    'frontline_integrations',
    { id: plan.id, channel_id: plan.channelId, kind: plan.kind, config: plan.config, ...row },
  ]);
};

const integrationStep = (database: 'erxes' | 'erxes_office'): Step => ({
  source: `${database}.integrations`,
  documents: async (ctx) => {
    if (messengerApps.size === 0) await loadApps(ctx);

    if (channelOfIntegration.size === 0) await loadChannels(ctx);

    return ctx.find(database === 'erxes' ? ctx.main : ctx.office, 'integrations');
  },
  transform: (doc, ctx) => {
    if (already(ctx, 'integration', docId(doc))) return skip('already in erxes by id');

    const plan = planOf(doc, ctx);

    if (typeof plan === 'string') return skip(plan);

    return integrationRow(ctx, plan, {
      name: (textOf(doc.name) ?? plan.kind).slice(0, 200),
      is_active: boolOf(doc.isActive) ?? true,
      created_by: ctx.user(idOf(doc.createdUserId)) ?? ctx.owner,
      created_at: createdOf(doc, doc.createdAt),
    });
  },
});

/**
 * Integrations old erxes deleted while their provider records, and conversations, stayed: the
 * import keeps them archived in the fallback channel, so their conversations stay readable.
 */
const orphanStep: Step = {
  source: 'import.provider-integrations',
  documents: () =>
    [...providerInboxes.entries()].map(([inboxId, inbox]) => ({ _id: inboxId, ...inbox })),
  transform: (doc, ctx) => {
    const id = String(docId(doc));
    const accountId = ctx.known('account', id);

    if (ctx.integrations.has(id)) return skip('in old erxes integrations');

    if (!accountId) return skip('no account');

    return integrationRow(
      ctx,
      {
        id,
        kind: String(doc.kind),
        channelId: FALLBACK_CHANNEL,
        config: {
          accountId,
          ...(doc.kind === 'call' || doc.kind === 'callpro' ? { queues: [] } : {}),
        },
      },
      {
        name: `${textOf(doc.name) ?? String(doc.kind)} (deleted in old erxes)`.slice(0, 200),
        is_active: false,
        created_by: ctx.owner,
      },
    );
  },
};

export const INTEGRATION_STEPS: Step[] = [
  integrationStep('erxes'),
  integrationStep('erxes_office'),
  orphanStep,
];
