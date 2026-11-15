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
} as const;

/** The record type whose Activity tab in core shows a ticket's events. */
export const TICKET_TIMELINE = 'frontline.ticket';

/** What a ticket's timeline records, each published in the change's transaction. */
export const TICKET_EVENTS = {
  created: { type: 'frontline.ticket.created', label: 'Ticket created' },
  fieldsChanged: { type: 'frontline.ticket.fields_changed', label: 'Ticket changed' },
  moved: { type: 'frontline.ticket.moved', label: 'Ticket moved' },
  assigned: { type: 'frontline.ticket.assigned', label: 'Ticket assigned' },
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
  ],
  timelines: [{ type: TICKET_TIMELINE, label: 'Ticket', permission: PERMISSIONS.channelView }],
  activityTypes: Object.values(TICKET_EVENTS).map(({ type, label }) => ({
    type,
    label,
    icon: 'IconTicket',
  })),
} satisfies PluginManifest;
