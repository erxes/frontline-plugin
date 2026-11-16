import type { PluginManifest } from '@erxes/core-contract';
import { config } from '#/config.ts';
import {
  CHANNEL_EVENTS,
  COMMENT_RECEIVED,
  CONVERSATION_EVENTS,
  CONVERSATION_TIMELINE,
  FORM_ACTIONS,
  FORM_EVENTS,
  FORM_LINK_DAYS,
  FORM_TIMELINE,
  INBOX_ACTIONS,
  INBOX_NOTIFICATIONS,
  INTEGRATION_BROKEN,
  JOBS,
  MESSAGE_RECEIVED,
  MESSAGE_RECEIVED_EVENT,
  PERMISSIONS,
  SEND_ACTIONS,
  SURVEY_EVENTS,
  SURVEY_TIMELINE,
  TICKET_EVENTS,
  TICKET_TIMELINE,
} from '#/core.ts';

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
 * What the plugin adds to core, sent on every start. Everything it names
 * starts with `frontline.`. A new scope waits for the owner's approval.
 */
export const manifest = {
  title: 'Frontline',
  description: 'Inbox, channels, tickets and customer messaging for erxes',
  version: config.version,
  ui: { remote: 'frontline_ui', entry: config.uiEntryUrl },
  // `server.ts` serves the procedures as REST at /api/v1 and their document here.
  api: {
    url: `${config.publicUrl}/api`,
    docs: [{ audience: 'member', path: '/openapi/member.json' }],
  },
  // Form senders, messenger visitors and provider senders become core customers; members hear
  // of assignments; a messenger shows its team's names and pictures; call recordings are stored
  // as core files. Tickets' branches and departments are core's units: frontline brings its own
  // teams in once and keeps a copy for ticket visibility.
  scopes: [
    'customers:read',
    'customers:write',
    'notifications:write',
    'users:read',
    'files:write',
    'units:read',
    'units:write',
  ],
  // Any change to a unit refreshes the copy (`modules/teams/sync.ts`).
  subscriptions: ['core.unit.*'],
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
  ],
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
    ...Object.values(CHANNEL_EVENTS).map(({ type, label }) => ({ kind: type, label })),
    { kind: INBOX_NOTIFICATIONS.assigned, label: 'A conversation is assigned to you' },
    { kind: INBOX_NOTIFICATIONS.mentioned, label: 'You are mentioned in a conversation' },
    { kind: INTEGRATION_BROKEN, label: 'A page, bot or mailbox you connected stopped working' },
  ],
  jobs: Object.values(JOBS),
  // What automations can start on: ticket and form events, a conversation's events, each
  // customer message and each comment under a connected post.
  events: [
    { type: TICKET_EVENTS.created.type, label: TICKET_EVENTS.created.label },
    { type: TICKET_EVENTS.moved.type, label: 'Ticket status changed' },
    { type: TICKET_EVENTS.slaBreached.type, label: TICKET_EVENTS.slaBreached.label },
    {
      type: FORM_EVENTS.submitted.type,
      label: FORM_EVENTS.submitted.label,
      description: 'A visitor sent a form; the customer is who sent it',
      subject: 'customer',
      fields: [
        { key: 'formId', label: 'Form ID', type: 'text' },
        { key: 'submissionId', label: 'Submission ID', type: 'text' },
        { key: 'referenceType', label: 'Answered about (record type)', type: 'text' },
        { key: 'referenceId', label: 'Answered about (record ID)', type: 'text' },
      ],
    },
    ...Object.values(CONVERSATION_EVENTS).map(({ type, label }) => ({
      type,
      label,
      subject: 'customer' as const,
    })),
    MESSAGE_RECEIVED_EVENT,
    ...[...Object.values(MESSAGE_RECEIVED), ...Object.values(COMMENT_RECEIVED)].map((event) => ({
      ...event,
      subject: 'customer' as const,
    })),
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
  actions: [
    {
      type: INBOX_ACTIONS.reply,
      label: 'Reply in the conversation',
      description: 'The bot answers the customer, unless a person has taken the conversation over',
      subject: 'customer',
      fields: [{ key: 'content', label: 'Message', type: 'longtext', required: true }],
    },
    {
      type: INBOX_ACTIONS.handOff,
      label: 'Hand off to a person',
      description: 'Stops automated replies, tells the customer and can assign a member',
      subject: 'customer',
      fields: [{ key: 'assigneeIds', label: 'Assign to', type: 'members', required: false }],
    },
    {
      type: FORM_ACTIONS.createLink,
      label: 'Create form link',
      description:
        "A personal link to a form: its answer is saved as the run's customer's, about the record the run started on, once",
      fields: [
        { key: 'formId', label: 'Form', type: 'plugin_record', recordType: 'form', required: true },
        {
          key: 'expiresInDays',
          label: 'Expires after (days)',
          type: 'number',
          required: false,
          placeholder: String(FORM_LINK_DAYS.default),
        },
      ],
      outputs: [
        { key: 'url', label: 'Form link', type: 'text' },
        { key: 'expiresAt', label: 'Link expires at', type: 'date' },
        { key: 'linkId', label: 'Link ID', type: 'text' },
        { key: 'formId', label: 'Form ID', type: 'text' },
      ],
    },
    ...Object.values(SEND_ACTIONS).map((action) => ({
      ...action,
      subject: 'customer' as const,
      fields: [{ key: 'message', label: 'Message', type: 'longtext' as const, required: true }],
    })),
  ],
} satisfies PluginManifest;
