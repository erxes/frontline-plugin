import type { PluginManifest } from '@erxes/core-contract';
import { config } from '#/config.ts';
import {
  AGENT_EVENTS,
  CHANNEL_EVENTS,
  CHANNEL_TIMELINE,
  CONVERSATION_EVENTS,
  CONVERSATION_TIMELINE,
  FORM_EVENTS,
  FORM_TIMELINE,
  INBOX_NOTIFICATIONS,
  INTEGRATION_BROKEN,
  JOBS,
  PERMISSIONS,
  SURVEY_EVENTS,
  SURVEY_TIMELINE,
  TICKET_EVENTS,
  TICKET_TIMELINE,
} from '#/core.ts';
import { AUTOMATION_ACTIONS, AUTOMATION_EVENTS } from '#/automationContract.ts';
import { TRANSFERS } from '#/modules/transfer/routes.ts';
import { RELATIONS } from '#/relations.ts';

/** What a ticket's people hear about, each sent with the event it names (`notify`). */
const TICKET_NOTICES = [
  { event: TICKET_EVENTS.assigned, label: 'A ticket is assigned to you' },
  { event: TICKET_EVENTS.moved, label: 'A ticket you follow moves' },
  { event: TICKET_EVENTS.fieldsChanged, label: 'A ticket you follow changes' },
  { event: TICKET_EVENTS.slaWarning, label: "Your ticket's SLA is running out" },
  { event: TICKET_EVENTS.slaBreached, label: "Your ticket's SLA is missed" },
];

const activityTypes = (events: Record<string, { type: string; label: string }>, icon: string) =>
  Object.values(events).map(({ type, label }) => ({ type, label, icon }));

/**
 * Where the desktop app waits for its sign-in code. Core sends codes only to an address listed
 * here, exactly, so the app listens on this one port of the member's own computer.
 */
const DESKTOP_REDIRECT = 'http://127.0.0.1:47823/callback';

/**
 * What the plugin adds to core, sent on every start. Everything it names
 * starts with `frontline.`. A new scope waits for the owner's approval.
 */
export const manifest = {
  title: 'Frontline',
  description: 'Inbox, channels, tickets and customer messaging for erxes',
  // Core shows these words in the member's language, such as the titles `notifyMembers` sends.
  translations: {
    mn: {
      'You were mentioned in a conversation': 'Таныг харилцан ярианд дурдлаа',
      'A conversation was assigned to you': 'Танд харилцан яриа хуваарилагдлаа',
      'Conversations were assigned to you': 'Танд харилцан ярианууд хуваарилагдлаа',
      'An integration stopped working': 'Интеграц ажиллахаа болилоо',
    },
  },
  version: config.version,
  ui: { remote: 'frontline_ui', entry: config.uiEntryUrl },
  // `server.ts` serves the procedures as REST at /api/v1 and their document here.
  api: {
    url: `${config.publicUrl}/api`,
    docs: [{ audience: 'member', path: '/openapi/member.json' }],
  },
  // "Sign in with erxes" for the desktop app, which then asks `/desktop` where this API is.
  oauth: { redirectUris: [DESKTOP_REDIRECT] },
  publicPaths: ['/desktop'],
  // Form senders, messenger visitors and provider senders become core customers; members hear
  // of assignments; a messenger shows its team's names and pictures; call recordings and
  // visitors' uploads are core files, which visitors read back through the plugin. Tickets'
  // branches and departments are core's units: frontline brings its own teams in once and keeps
  // a copy for ticket visibility.
  scopes: [
    'customers:read',
    'customers:write',
    'notifications:write',
    'users:read',
    'files:read',
    'files:write',
    'units:read',
    'units:write',
  ],
  // Any change to a unit refreshes the copy (`modules/teams/sync.ts`). A messenger's core agent
  // answers through core's agent events (`modules/messenger/agent.ts`).
  subscriptions: ['core.unit.*', ...Object.values(AGENT_EVENTS)],
  // Conversations, tickets and form submissions in core's customer filter (`relations.ts`).
  relations: RELATIONS,
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
      label: 'Manage tags and ticket properties',
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
    {
      action: PERMISSIONS.surveySend,
      label: 'Send surveys into conversations',
      group: 'Inbox',
    },
    {
      action: PERMISSIONS.conversationEditFields,
      label: "Change conversations' custom fields",
      group: 'Inbox',
    },
    {
      action: PERMISSIONS.integrationView,
      label: 'See connected pages, bots and mailboxes',
      group: 'Integrations',
    },
    {
      action: PERMISSIONS.integrationManage,
      label: 'Connect and remove pages, bots and mailboxes',
      group: 'Integrations',
    },
    { action: PERMISSIONS.callView, label: 'See calls and call queues', group: 'Calls' },
    {
      action: PERMISSIONS.recordsExport,
      label: 'Export the tickets and form submissions of your channels',
      group: 'Frontline',
    },
    {
      action: PERMISSIONS.recordsImport,
      label: 'Import tickets and form submissions into your channels',
      group: 'Frontline',
    },
  ],
  // Tickets and form submissions in core's Import & export (`modules/transfer`).
  transfer: TRANSFERS,
  // What an owner adds to a role in one step, as the old plugin's default roles did.
  permissionSets: [
    {
      key: 'admin',
      label: 'Frontline admin',
      description: 'Every Frontline permission',
      permissions: Object.values(PERMISSIONS),
    },
    {
      key: 'user',
      label: 'Frontline user',
      description: "The inbox and tickets of the member's channels, and the knowledge base",
      permissions: [
        PERMISSIONS.channelView,
        PERMISSIONS.inboxView,
        PERMISSIONS.surveySend,
        PERMISSIONS.conversationEditFields,
        PERMISSIONS.kbView,
        PERMISSIONS.helpCenterView,
      ],
    },
    {
      key: 'viewer',
      label: 'Frontline viewer',
      description: 'Reads the knowledge base and help centers',
      permissions: [PERMISSIONS.kbView, PERMISSIONS.helpCenterView],
    },
  ],
  notificationKinds: [
    ...TICKET_NOTICES.map(({ event, label }) => ({ kind: event.type, label })),
    { kind: CHANNEL_EVENTS.membersAdded.type, label: 'You are added to a channel' },
    { kind: INBOX_NOTIFICATIONS.assigned, label: 'A conversation is assigned to you' },
    { kind: INBOX_NOTIFICATIONS.mentioned, label: 'You are mentioned in a conversation' },
    { kind: INTEGRATION_BROKEN, label: 'A page, bot or mailbox you connected stopped working' },
  ],
  jobs: Object.values(JOBS),
  events: AUTOMATION_EVENTS,
  timelines: [
    // Core asks `/timelines/access` whether the member sees each record (`modules/timelines.ts`).
    {
      type: TICKET_TIMELINE,
      label: 'Ticket',
      permission: PERMISSIONS.channelView,
      recordAccess: true,
    },
    { type: FORM_TIMELINE, label: 'Form', permission: PERMISSIONS.channelView, recordAccess: true },
    {
      type: SURVEY_TIMELINE,
      label: 'Survey',
      permission: PERMISSIONS.channelView,
      recordAccess: true,
    },
    {
      type: CHANNEL_TIMELINE,
      label: 'Channel',
      permission: PERMISSIONS.channelView,
      recordAccess: true,
    },
    {
      type: CONVERSATION_TIMELINE,
      label: 'Conversation',
      permission: PERMISSIONS.inboxView,
      recordAccess: true,
    },
  ],
  activityTypes: [
    ...activityTypes(TICKET_EVENTS, 'IconTicket'),
    ...activityTypes(FORM_EVENTS, 'IconFileText'),
    ...activityTypes(SURVEY_EVENTS, 'IconChecklist'),
    ...activityTypes(CHANNEL_EVENTS, 'IconCircles'),
    ...activityTypes(CONVERSATION_EVENTS, 'IconMessage'),
  ],
  actions: AUTOMATION_ACTIONS,
} satisfies PluginManifest;
