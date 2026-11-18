import { createCoreClient } from '@erxes/plugin-sdk';
import { config, PLUGIN } from '#/config.ts';

/**
 * Core, called as this plugin: `core.forOrg(orgId).customers.get({ id })`.
 * Tokens last 15 minutes and carry the scopes the organisation granted.
 * Call core from the API only, outside request transactions. A call core doesn't answer in
 * `config.outboundMs` fails.
 */
export const core = createCoreClient({
  coreUrl: config.coreUrl,
  plugin: PLUGIN,
  clientSecret: config.pluginSecret,
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      signal: AbortSignal.any([
        AbortSignal.timeout(config.outboundMs),
        ...(init?.signal ? [init.signal] : []),
      ]),
    }),
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
  /** Change the tags and ticket properties every channel shares. */
  settingsManage: 'frontline.settings.manage',
  /** See the help centers. */
  helpCenterView: 'frontline.help_center.view',
  /** Create, change and delete help centers and connect their domains. */
  helpCenterManage: 'frontline.help_center.manage',
  /** Read and answer the conversations of the channels you belong to. */
  inboxView: 'frontline.inbox.view',
  /** Send a channel's active surveys into its conversations. */
  surveySend: 'frontline.survey.send',
  /** Change the custom fields of the conversations you can read. */
  conversationEditFields: 'frontline.conversation.edit_fields',
  /** See the connected pages, bots and mailboxes. */
  integrationView: 'frontline.integration.view',
  /** Connect, check and remove pages, bots and mailboxes. */
  integrationManage: 'frontline.integration.manage',
  /** See the calls of your channels, and the queues of the PBXs you answer. */
  callView: 'frontline.call.view',
} as const;

/** The conversation's record type in core: its Activity tab's events and its custom fields. */
export const CONVERSATION_TIMELINE = 'frontline.conversation';

/** What happens to a conversation, published in the change's transaction. */
export const CONVERSATION_EVENTS = {
  started: { type: 'frontline.conversation.started', label: 'Conversation started' },
  assigned: { type: 'frontline.conversation.assigned', label: 'Conversation assigned' },
  statusChanged: { type: 'frontline.conversation.status_changed', label: 'Conversation status' },
} as const;

/**
 * A customer's message through any integration, published for automations with no subject or
 * record, so it makes no timeline entry: every message on the Activity tab would bury the rest.
 */
export const MESSAGE_RECEIVED_EVENT = {
  type: 'frontline.conversation.message_received',
  label: 'Customer sent a message',
} as const;

/** What automations can do in a conversation (`modules/inbox/automations.ts`). */
export const INBOX_ACTIONS = {
  reply: 'frontline.conversation.reply',
  handOff: 'frontline.conversation.hand_off',
} as const;

/** How often core tries a reply before the inbox marks it failed. */
export const SEND_ATTEMPTS = 5;

/** What the inbox tells members about, through core's notifications. */
export const INBOX_NOTIFICATIONS = {
  assigned: 'frontline.conversation.assigned',
  mentioned: 'frontline.conversation.mentioned',
} as const;

/** What a provider's new message publishes, so an automation can start from it. */
export const MESSAGE_RECEIVED = {
  telegram: {
    type: 'frontline.telegram.message_received',
    label: 'Telegram Message',
    description: 'A connected bot received a Telegram message',
  },
  mail: {
    type: 'frontline.mail.received',
    label: 'Email Received',
    description: 'An email arrived in a connected mailbox',
  },
  facebook: { type: 'frontline.facebook.message_received', label: 'Facebook message received' },
  instagram: { type: 'frontline.instagram.message_received', label: 'Instagram message received' },
} as const;

/** What a person's comment under a connected page's or account's post publishes. */
export const COMMENT_RECEIVED = {
  facebook: { type: 'frontline.facebook.comment_received', label: 'Facebook comment received' },
  instagram: { type: 'frontline.instagram.comment_received', label: 'Instagram comment received' },
} as const;

/**
 * Automation steps that reply to the run's customer through a provider: in the conversation the
 * trigger names, else in the customer's latest conversation of that kind.
 */
export const SEND_ACTIONS = {
  telegram: {
    type: 'frontline.telegram.send_message',
    label: 'Send Telegram Message',
    description: "Reply in the customer's Telegram chat as the bot",
  },
  discord: {
    type: 'frontline.discord.send_message',
    label: 'Send Discord Message',
    description: "Reply in the customer's Discord channel as the bot",
  },
  mail: {
    type: 'frontline.mail.send',
    label: 'Send Email',
    description: "Reply to the customer's email right away, from the mailbox it came to",
  },
  facebook: {
    type: 'frontline.facebook.reply',
    label: 'Reply on Facebook',
    description: 'Answers in the chat, or in the comment thread under a post, as the page',
  },
  instagram: {
    type: 'frontline.instagram.reply',
    label: 'Reply on Instagram',
    description: 'Answers in the chat, or in the comment thread under a post, as the account',
  },
} as const;

/** Tells whoever connected an account that the provider stopped accepting it. */
export const INTEGRATION_BROKEN = 'frontline.integration.broken';

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

/**
 * Core POSTs each to `/api/jobs/<name>` (`jobs.ts`); a `cron` job runs once per organisation.
 * `retry`: attempts in all, the first wait and the longest, in seconds.
 */
export const JOBS = {
  /** Warns assignees before a ticket's SLA runs out, and when it has. */
  sla: { name: 'tickets.sla', cron: '*/5 * * * *' },
  /** Re-reads pending help center domains from Cloudflare until they are served. */
  domains: { name: 'helpcenter.domains', cron: '*/10 * * * *' },
  /** Publishes the knowledge base articles scheduled for now or earlier. */
  kbPublish: { name: 'knowledgebase.publish', cron: '* * * * *' },
  /** Hands a queued reply to its adapter (`modules/inbox/send.ts`). */
  send: {
    name: 'messages.send',
    retry: { attempts: SEND_ATTEMPTS, delay: 30, maxDelay: 3600 },
  },
  /** Reads connected mailboxes (UTC cron, as every `cron` here). */
  mailSync: {
    name: 'integrations.mail-sync',
    cron: '*/2 * * * *',
    retry: { attempts: 2, delay: 30, maxDelay: 60 },
  },
  /** Rechecks every connected account. */
  check: { name: 'integrations.check', cron: '17 3 * * *' },
  /** Copies a call's recording from the PBX to core's storage. */
  recording: { name: 'calls.recording', retry: { attempts: 5, delay: 60, maxDelay: 1800 } },
  /**
   * Brings the organisation's own teams to core once, then copies core's branches and
   * departments (`modules/teams/sync.ts`): on install, when the owner approves the units scopes,
   * and nightly in case an event was missed.
   */
  units: { name: 'teams.units-sync', cron: '41 2 * * *', onInstall: true },
} as const;

/** The record type whose Activity tab shows a form's events, and its submissions. */
export const FORM_TIMELINE = 'frontline.form';

export const FORM_EVENTS = {
  created: { type: 'frontline.form.created', label: 'Form created' },
  fieldsChanged: { type: 'frontline.form.fields_changed', label: 'Form changed' },
  /** About the customer who sent it, so it also starts automations. */
  submitted: { type: 'frontline.form.submitted', label: 'Form submitted' },
} as const;

/** What automations can do with forms (`modules/forms/links.ts`). */
export const FORM_ACTIONS = {
  createLink: 'frontline.form.create_link',
} as const;

/** How many days a form link lasts when the step leaves it out, and at most. */
export const FORM_LINK_DAYS = { default: 30, max: 365 } as const;

/** The record type whose Activity tab shows a survey's events. */
export const SURVEY_TIMELINE = 'frontline.survey';

export const SURVEY_EVENTS = {
  created: { type: 'frontline.survey.created', label: 'Survey created' },
  fieldsChanged: { type: 'frontline.survey.fields_changed', label: 'Survey changed' },
} as const;
