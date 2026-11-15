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

/** Core POSTs each to `/api/jobs/<name>`; a `cron` job runs once per organisation. */
export const JOBS = {
  /** Warns assignees before a ticket's SLA runs out, and when it has. */
  sla: { name: 'tickets.sla', cron: '*/5 * * * *' },
  /** Re-reads pending help center domains from Cloudflare until they are served. */
  domains: { name: 'helpcenter.domains', cron: '*/10 * * * *' },
} as const;

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
  scopes: [],
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
  ],
  notificationKinds: [
    ...TICKET_NOTICES.map(({ event, label }) => ({ kind: event.type, label })),
    ...Object.values(CHANNEL_EVENTS).map(({ type, label }) => ({ kind: type, label })),
  ],
  jobs: Object.values(JOBS),
  // What automations can start on.
  events: [
    { type: TICKET_EVENTS.created.type, label: TICKET_EVENTS.created.label },
    { type: TICKET_EVENTS.moved.type, label: 'Ticket status changed' },
    { type: TICKET_EVENTS.slaBreached.type, label: TICKET_EVENTS.slaBreached.label },
  ],
  timelines: [{ type: TICKET_TIMELINE, label: 'Ticket', permission: PERMISSIONS.channelView }],
  activityTypes: Object.values(TICKET_EVENTS).map(({ type, label }) => ({
    type,
    label,
    icon: 'IconTicket',
  })),
} satisfies PluginManifest;
