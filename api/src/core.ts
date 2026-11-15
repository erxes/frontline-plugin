import type { PluginManifest } from '@erxes/core-contract';
import { createCoreClient } from '@erxes/plugin-sdk';
import { config, PLUGIN } from '#/config.ts';

/**
 * Core, called as this plugin: `core.forOrg(orgId).customers.get({ id })`.
 * Tokens last 15 minutes and carry the scopes the organisation granted.
 * Call core from the API only, outside request transactions.
 */
export const core = createCoreClient({
  coreUrl: config.coreUrl,
  plugin: PLUGIN,
  clientSecret: config.pluginSecret,
});

/** The actions members can be granted in core's roles. */
export const PERMISSIONS = {
  /** See the channels you belong to; change the ones you are an admin of. */
  channelView: 'frontline.channel.view',
  /** Create channels, and see and change every channel. */
  channelManage: 'frontline.channel.manage',
  /** Read every knowledge base topic, category and article. */
  kbView: 'frontline.knowledgebase.view',
  /** Create, change and delete topics. */
  kbTopicManage: 'frontline.knowledgebase_topic.manage',
  /** Create, change and delete categories. */
  kbCategoryManage: 'frontline.knowledgebase_category.manage',
  /** Write, change and delete articles. */
  kbArticleManage: 'frontline.knowledgebase_article.manage',
  /** Change the tags, teams and ticket properties every channel shares. */
  settingsManage: 'frontline.settings.manage',
  /** See the help centers. */
  helpCenterView: 'frontline.help_center.view',
  /** Create, change and delete help centers and connect their domains. */
  helpCenterManage: 'frontline.help_center.manage',
  /** Read and answer the conversations of the channels you belong to. */
  inboxView: 'frontline.inbox.view',
} as const;

/** The record type whose Activity tab in core shows a conversation's events. */
export const CONVERSATION_TIMELINE = 'frontline.conversation';

/** What happens to a conversation, published in the change's transaction. */
export const CONVERSATION_EVENTS = {
  started: { type: 'frontline.conversation.started', label: 'Conversation started' },
  assigned: { type: 'frontline.conversation.assigned', label: 'Conversation assigned' },
  statusChanged: { type: 'frontline.conversation.status_changed', label: 'Conversation status' },
} as const;

/** How often core tries a reply before the inbox marks it failed. */
export const SEND_ATTEMPTS = 5;

/** What the inbox tells members about, through core's notifications. */
export const INBOX_NOTIFICATIONS = {
  assigned: 'frontline.conversation.assigned',
  mentioned: 'frontline.conversation.mentioned',
} as const;

/** The record type whose Activity tab in core shows a ticket's events. */
export const TICKET_TIMELINE = 'frontline.ticket';

/** What a ticket's timeline records, each published in the change's transaction. */
export const TICKET_EVENTS = {
  created: { type: 'frontline.ticket.created', label: 'Ticket created' },
  fieldsChanged: { type: 'frontline.ticket.fields_changed', label: 'Ticket changed' },
  moved: { type: 'frontline.ticket.moved', label: 'Ticket moved' },
  assigned: { type: 'frontline.ticket.assigned', label: 'Ticket assigned' },
  slaWarning: { type: 'frontline.ticket.sla_warning', label: 'Ticket SLA running out' },
  slaBreached: { type: 'frontline.ticket.sla_breached', label: 'Ticket SLA missed' },
} as const;

/** What channel members hear about. */
export const CHANNEL_EVENTS = {
  membersAdded: { type: 'frontline.channel.members_added', label: 'You are added to a channel' },
} as const;

/** Core's audit log records a deleted ticket with this action; it has no timeline left. */
export const TICKET_REMOVED = 'frontline.ticket.removed';

/** What a ticket's people hear about, each sent with the event it names (`notify`). */
const TICKET_NOTICES = [
  { event: TICKET_EVENTS.assigned, label: 'A ticket is assigned to you' },
  { event: TICKET_EVENTS.moved, label: 'A ticket you follow moves' },
  { event: TICKET_EVENTS.fieldsChanged, label: 'A ticket you follow changes' },
  { event: TICKET_EVENTS.slaWarning, label: "Your ticket's SLA is running out" },
  { event: TICKET_EVENTS.slaBreached, label: "Your ticket's SLA is missed" },
];

/**
 * Core POSTs each to `/api/jobs/<name>` (`jobs.ts`); a `cron` job runs once per organisation.
 * `retry`: attempts in all, the first wait and the longest, in seconds.
 */
export const JOBS = {
  /** Warns assignees before a ticket's SLA runs out, and when it has. */
  sla: { name: 'tickets.sla', cron: '*/5 * * * *' },
  /** Re-reads pending help center domains from Cloudflare until they are served. */
  domains: { name: 'helpcenter.domains', cron: '*/10 * * * *' },
  /** Hands a queued reply to its adapter (`modules/inbox/send.ts`). */
  send: {
    name: 'messages.send',
    retry: { attempts: SEND_ATTEMPTS, delay: 30, maxDelay: 3600 },
  },
} as const;

/** The record type whose Activity tab shows a form's events, and its submissions. */
export const FORM_TIMELINE = 'frontline.form';

export const FORM_EVENTS = {
  created: { type: 'frontline.form.created', label: 'Form created' },
  fieldsChanged: { type: 'frontline.form.fields_changed', label: 'Form changed' },
  /** About the customer who sent it, so it also starts automations. */
  submitted: { type: 'frontline.form.submitted', label: 'Form submitted' },
} as const;

/** The record type whose Activity tab shows a survey's events. */
export const SURVEY_TIMELINE = 'frontline.survey';

export const SURVEY_EVENTS = {
  created: { type: 'frontline.survey.created', label: 'Survey created' },
  fieldsChanged: { type: 'frontline.survey.fields_changed', label: 'Survey changed' },
} as const;

const activityTypes = (events: Record<string, { type: string; label: string }>, icon: string) =>
  Object.values(events).map(({ type, label }) => ({ type, label, icon }));

/**
 * What the plugin adds to core, sent on every start. Everything it names
 * starts with `frontline.`. A new scope waits for the owner's approval.
 */
export const manifest = {
  title: 'Frontline',
  description: 'Inbox, channels, tickets and customer messaging for erxes',
  version: config.version,
  ui: { remote: 'frontline_ui', entry: config.uiEntryUrl },
  api: { url: `${config.publicUrl}/api` },
  // Form senders, messenger visitors and provider senders become core customers; members hear
  // of assignments.
  scopes: ['customers:read', 'customers:write', 'notifications:write'],
  permissions: [
    {
      action: PERMISSIONS.channelView,
      label: 'Use the channels you belong to',
      group: 'Frontline',
    },
    {
      action: PERMISSIONS.channelManage,
      label: 'Create channels and manage every channel',
      group: 'Frontline',
    },
    {
      action: PERMISSIONS.kbView,
      label: 'Read the knowledge base',
      group: 'Knowledge base',
    },
    {
      action: PERMISSIONS.kbTopicManage,
      label: 'Manage knowledge base topics',
      group: 'Knowledge base',
    },
    {
      action: PERMISSIONS.kbCategoryManage,
      label: 'Manage knowledge base categories',
      group: 'Knowledge base',
    },
    {
      action: PERMISSIONS.kbArticleManage,
      label: 'Manage knowledge base articles',
      group: 'Knowledge base',
    },
    {
      action: PERMISSIONS.settingsManage,
      label: 'Manage tags, teams and ticket properties',
      group: 'Frontline',
    },
    { action: PERMISSIONS.helpCenterView, label: 'See help centers', group: 'Help center' },
    {
      action: PERMISSIONS.helpCenterManage,
      label: 'Manage help centers and their domains',
      group: 'Help center',
    },
    {
      action: PERMISSIONS.inboxView,
      label: "Answer the conversations of the channels you're in",
      group: 'Inbox',
    },
  ],
  notificationKinds: [
    ...TICKET_NOTICES.map(({ event, label }) => ({ kind: event.type, label })),
    ...Object.values(CHANNEL_EVENTS).map(({ type, label }) => ({ kind: type, label })),
    { kind: INBOX_NOTIFICATIONS.assigned, label: 'A conversation is assigned to you' },
    { kind: INBOX_NOTIFICATIONS.mentioned, label: 'You are mentioned in a conversation' },
  ],
  jobs: Object.values(JOBS),
  // What automations can start on.
  events: [
    { type: TICKET_EVENTS.created.type, label: TICKET_EVENTS.created.label },
    { type: TICKET_EVENTS.moved.type, label: 'Ticket status changed' },
    { type: TICKET_EVENTS.slaBreached.type, label: TICKET_EVENTS.slaBreached.label },
    {
      type: FORM_EVENTS.submitted.type,
      label: FORM_EVENTS.submitted.label,
      description: 'A visitor sent a form; the customer is who sent it',
      subject: 'customer',
    },
  ],
  timelines: [
    { type: TICKET_TIMELINE, label: 'Ticket', permission: PERMISSIONS.channelView },
    { type: FORM_TIMELINE, label: 'Form', permission: PERMISSIONS.channelView },
    { type: SURVEY_TIMELINE, label: 'Survey', permission: PERMISSIONS.channelView },
    { type: CONVERSATION_TIMELINE, label: 'Conversation', permission: PERMISSIONS.inboxView },
  ],
  activityTypes: [
    ...activityTypes(TICKET_EVENTS, 'IconTicket'),
    ...activityTypes(FORM_EVENTS, 'IconFileText'),
    ...activityTypes(SURVEY_EVENTS, 'IconChecklist'),
    ...activityTypes(CONVERSATION_EVENTS, 'IconMessage'),
  ],
} satisfies PluginManifest;
