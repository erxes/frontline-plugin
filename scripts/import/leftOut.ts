// Old collections this importer leaves out as a whole, each with why, so the report lists every
// collection Frontline's old data lived in.
import type { LeftOut } from './step.ts';

const SECRETS = 'provider settings and tokens: members connect the account again';
const LOGS = 'logs: the new plugin logs through its structured logger';
const NO_ADAPTER = 'no adapter for this provider in the new Frontline';
const CORE = "core's importer takes it";
const NOT_FRONTLINE = "not Frontline's data";

const ofAll = (databases: string[], collections: string[], reason: string): LeftOut[] =>
  databases.flatMap((database) =>
    collections.map((collection) => ({ source: `${database}.${collection}`, reason })),
  );

export const LEFT_OUT: LeftOut[] = [
  ...ofAll(
    ['erxes'],
    [
      'facebook_accounts',
      'facebook_configs',
      'instagram_accounts',
      'instagram_configs',
      'calls_configs',
      'cloudflare_calls_configs',
      'zalo_configs',
    ],
    SECRETS,
  ),
  ...ofAll(
    ['erxes_office_integrations'],
    [
      'accounts',
      'configs',
      'facebook_accounts',
      'facebook_configs',
      'instagram_configs',
      'whatsapp_configs',
      'whatsapp_accounts',
    ],
    SECRETS,
  ),
  ...ofAll(['erxes'], ['logs_callpros', 'facebook_logs', 'imap_logs', 'instagram_logs'], LOGS),
  ...ofAll(['erxes_office_integrations'], ['logs'], LOGS),
  ...ofAll(
    ['erxes'],
    ['viber_integrations', 'cloudflare_calls_integrations', 'cloudflare_calls_histories'],
    NO_ADAPTER,
  ),
  ...ofAll(
    ['erxes_office_integrations'],
    [
      'conversations_productboards',
      'conversation_messages_whatsapps',
      'conversations_whatsapps',
      'customers_whatsapps',
      'whatsapp_integrations',
      'whatsapp_conversations',
      'whatsapp_conversation_messages',
      'whatsapp_customers',
      'conversation_messages_telnyxes',
      'conversation_messages_smooch_twilio_sms',
      'conversations_smooch_twilio_sms',
      'customers_smooch_twilio_sms',
    ],
    NO_ADAPTER,
  ),
  {
    source: 'erxes.posts_conversations_facebooks',
    reason:
      'the page posts comments were on: a comment thread names its post id, and Facebook serves the post',
  },
  ...ofAll(
    ['erxes_office_integrations'],
    ['posts_conversations_facebooks', 'posts_facebooks', 'instagram_posts_conversations'],
    'page posts: a comment thread names its post id, and Facebook serves the post',
  ),
  {
    source: 'erxes_office_integrations.comments_facebooks',
    reason:
      'post comments of 2023 that no old conversation held, in any copy: the old inbox never showed them',
  },
  {
    source: 'erxes.comment_outbox_facebooks',
    reason: 'replies waiting to post to Facebook: the queue of a running install',
  },
  {
    source: 'erxes.conversation_messages_telegrams',
    reason:
      'copies of the Telegram messages erxes.conversation_messages has; read for their Telegram ids',
  },
  {
    source: 'erxes.calls_conversations',
    reason: 'the call ↔ conversation map: each call history names its conversation',
  },
  {
    source: 'erxes.calls_operators',
    reason: "operators' last pause state; the operators come from each PBX's integration",
  },
  { source: 'erxes.calls_active_sessions', reason: 'calls ringing when the copy was taken' },
  {
    source: 'erxes_office_integrations.call_records',
    reason: 'recordings of a call integration erxes no longer has; no call row names them',
  },
  {
    source: 'erxes_office_integrations.calendars',
    reason: 'Nylas calendars: the new Frontline has no calendar',
  },
  {
    source: 'erxes_office_integrations.schedule_pages',
    reason: 'Nylas booking pages: the new Frontline has no calendar',
  },
  {
    source: 'erxes_office_integrations.events',
    reason: 'Nylas calendar events: the new Frontline has no calendar',
  },
  { source: 'erxes_office_integrations.migrations', reason: 'the old service schema version' },
  {
    source: 'erxes.visitors',
    reason:
      "anonymous widget visitors with no core customer: a new visitor's first message makes one",
  },
  {
    source: 'erxes.frontline_ticket_configs',
    reason:
      'per-pipeline settings the new pipelines keep as columns; each pipeline sets them again',
  },
  { source: 'erxes.frontline_ticket_activities', reason: CORE },
  { source: 'erxes.activity_logs', reason: CORE },
  {
    source: 'erxes.conformities',
    reason: "read for each old ticket's customer and company; core's importer takes the rest",
  },
  {
    source: 'erxes_office.conformities',
    reason: "read for each old ticket's customer and company; core's importer takes the rest",
  },
  {
    source: 'erxes.messenger_apps',
    reason: "read into each messenger's knowledge base topic and website buttons",
  },
  {
    source: 'erxes_office.messenger_apps',
    reason: "the old copy's messenger apps: the messengers import from erxes",
  },
  {
    source: 'erxes.emojis',
    reason:
      "feed reactions (core's) and article hearts from members; an article reaction names a customer",
  },
  {
    source: 'erxes_office.emojis',
    reason:
      "feed reactions (core's) and article hearts from members; an article reaction names a customer",
  },
  ...ofAll(
    ['erxes', 'erxes_office'],
    ['chats', 'chat-messages', 'chat_messages'],
    "team chat: core's, not Frontline's",
  ),
  { source: 'erxes.chat_message_reactions', reason: "team chat: core's, not Frontline's" },
  { source: 'erxes.accounts', reason: "the accounting plugin's accounts: " + NOT_FRONTLINE },
  { source: 'erxes.email_deliveries', reason: "core's mail log" },
  { source: 'erxes.widgets_messengers_bots', reason: 'empty' },
  ...ofAll(
    ['erxes_integrations'],
    [
      'logs',
      'conversation_messages_facebooks',
      'configs',
      'conversations_facebooks',
      'integrations',
      'customers_facebooks',
      'accounts',
    ],
    'an early test copy: 2 Facebook integrations neither erxes nor its old copy has, whose 2 conversations (3 messages reading “test”) stay out with them',
  ),
];
