import type { PluginManifest } from '@erxes/core-contract';
import {
  COMMENT_RECEIVED,
  CONVERSATION_EVENTS,
  FORM_ACTIONS,
  FORM_EVENTS,
  FORM_LINK_DAYS,
  INBOX_ACTIONS,
  MESSAGE_RECEIVED,
  MESSAGE_RECEIVED_EVENT,
  SEND_ACTIONS,
  TICKET_ACTIONS,
  TICKET_EVENTS,
} from '#/core.ts';
import { TICKET_PRIORITIES } from '#/db/tickets.ts';
import {
  INTEGRATION_RECORDS,
  type IntegrationRecord,
} from '#/modules/integrations/automationRecords.ts';

type Events = NonNullable<PluginManifest['events']>;

type Actions = NonNullable<PluginManifest['actions']>;

type Field = NonNullable<Events[number]['fields']>[number];

const text = (key: string, label: string): Field => ({ key, label, type: 'text' });
const member = (key: string, label: string): Field => ({ key, label, type: 'member' });

const pipeline = (key: string, label: string): Field => ({
  key,
  label,
  type: 'text',
  recordType: 'pipeline',
});

const connection = (recordType: IntegrationRecord): Field => ({
  key: 'integrationId',
  label: INTEGRATION_RECORDS[recordType].label,
  type: 'text',
  recordType,
});

const message = (recordType: IntegrationRecord): Field[] => [
  connection(recordType),
  text('content', 'Message'),
  text('conversationId', 'Conversation ID'),
  text('messageId', 'Message ID'),
];

const BUTTON: Field[] = [text('payload', 'Button payload')];
const COMMENT: Field[] = [text('postId', 'Post ID'), text('commentId', 'Comment ID')];

const TICKET_SLA: Field[] = [
  text('clock', 'SLA clock'),
  { key: 'dueAt', label: 'Due at', type: 'date' },
];

const REPLY_CLOCK: Field[] = [
  text('conversationId', 'Conversation ID'),
  text('channelId', 'Channel ID'),
  member('assigneeId', 'Assignee'),
  { key: 'waitingSince', label: 'Waiting since', type: 'date' },
  { key: 'dueAt', label: 'Due at', type: 'date' },
];

const ticketEvents: Events = [
  {
    type: TICKET_EVENTS.created.type,
    label: TICKET_EVENTS.created.label,
    record: 'Ticket',
    fields: [
      text('number', 'Ticket number'),
      text('name', 'Ticket name'),
      { key: 'priority', label: 'Priority', type: 'number' },
      member('assigneeId', 'Assignee'),
      pipeline('pipelineId', 'Pipeline'),
      text('statusId', 'Status ID'),
      text('customerId', 'Customer ID'),
      text('companyId', 'Company ID'),
    ],
  },
  {
    type: TICKET_EVENTS.moved.type,
    label: 'Ticket status changed',
    record: 'Ticket',
    fields: [
      pipeline('fromPipelineId', 'From pipeline'),
      pipeline('toPipelineId', 'To pipeline'),
      text('fromStatusId', 'From status ID'),
      text('toStatusId', 'To status ID'),
      text('fromNumber', 'Old ticket number'),
      text('toNumber', 'Ticket number'),
    ],
  },
  {
    type: TICKET_EVENTS.assigned.type,
    label: TICKET_EVENTS.assigned.label,
    record: 'Ticket',
    fields: [
      member('fromAssigneeId', 'Previous assignee'),
      member('toAssigneeId', 'Assignee'),
      { key: 'fromAssignedMemberIds', label: 'Previous members', type: 'list' },
      { key: 'toAssignedMemberIds', label: 'Members', type: 'list' },
    ],
  },
  {
    type: TICKET_EVENTS.fieldsChanged.type,
    label: TICKET_EVENTS.fieldsChanged.label,
    record: 'Ticket',
    fields: [{ key: 'fields', label: 'Changed fields', type: 'list' }],
  },
  {
    type: TICKET_EVENTS.slaWarning.type,
    label: TICKET_EVENTS.slaWarning.label,
    record: 'Ticket',
    fields: TICKET_SLA,
  },
  {
    type: TICKET_EVENTS.slaBreached.type,
    label: TICKET_EVENTS.slaBreached.label,
    record: 'Ticket',
    fields: TICKET_SLA,
  },
];

const conversationEvents: Events = [
  {
    type: CONVERSATION_EVENTS.started.type,
    label: CONVERSATION_EVENTS.started.label,
    subject: 'customer',
    fields: [connection('integration')],
  },
  {
    type: CONVERSATION_EVENTS.assigned.type,
    label: CONVERSATION_EVENTS.assigned.label,
    subject: 'customer',
    fields: [
      member('from', 'Previous assignee'),
      member('to', 'Assignee'),
      text('reason', 'Assigned by (member, automation, auto or unanswered)'),
    ],
  },
  {
    type: CONVERSATION_EVENTS.statusChanged.type,
    label: CONVERSATION_EVENTS.statusChanged.label,
    subject: 'customer',
    fields: [text('from', 'Previous status'), text('to', 'Status')],
  },
  ...[CONVERSATION_EVENTS.replyDueSoon, CONVERSATION_EVENTS.replyOverdue].map((event) => ({
    ...event,
    subject: 'customer' as const,
    fields: REPLY_CLOCK,
  })),
  {
    ...MESSAGE_RECEIVED_EVENT,
    fields: [
      ...message('integration'),
      text('customerId', 'Customer ID'),
      text('kind', 'Integration kind'),
      text('operator', 'Answered by (bot or person)'),
    ],
  },
  ...[
    { ...MESSAGE_RECEIVED.telegram, fields: message('telegram_bot') },
    { ...MESSAGE_RECEIVED.discord, fields: message('discord_bot') },
    { ...MESSAGE_RECEIVED.mail, fields: [...message('mailbox'), text('subject', 'Subject')] },
    { ...MESSAGE_RECEIVED.facebook, fields: [...message('facebook_page'), ...BUTTON] },
    { ...MESSAGE_RECEIVED.instagram, fields: [...message('instagram_account'), ...BUTTON] },
    { ...MESSAGE_RECEIVED.messenger, fields: message('messenger') },
    { ...COMMENT_RECEIVED.facebook, fields: [...message('facebook_page'), ...COMMENT] },
    { ...COMMENT_RECEIVED.instagram, fields: [...message('instagram_account'), ...COMMENT] },
  ].map((event) => ({ ...event, subject: 'customer' as const })),
];

export const AUTOMATION_EVENTS: Events = [
  ...ticketEvents,
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
  ...conversationEvents,
];

const SENT: Field[] = [
  text('messageId', 'Sent message ID'),
  text('conversationId', 'Conversation ID'),
  text('content', 'Sent message'),
];

const PRIORITY_OPTIONS = Object.entries(TICKET_PRIORITIES).map(([label, value]) => ({
  value: String(value),
  label: label.charAt(0).toUpperCase() + label.slice(1),
}));

export const AUTOMATION_ACTIONS: Actions = [
  {
    type: INBOX_ACTIONS.reply,
    label: 'Reply in the conversation',
    description: 'The bot answers the customer, unless a person has taken the conversation over',
    subject: 'customer',
    fields: [{ key: 'content', label: 'Message', type: 'longtext', required: true }],
    outputs: [{ key: 'sent', label: 'Sent', type: 'boolean' }],
  },
  {
    type: INBOX_ACTIONS.handOff,
    label: 'Hand off to a person',
    description: 'Stops automated replies, tells the customer and can assign a member',
    subject: 'customer',
    fields: [{ key: 'assigneeIds', label: 'Assign to', type: 'members', required: false }],
    outputs: [text('operator', 'Answered by'), member('assigneeId', 'Assignee')],
  },
  {
    type: TICKET_ACTIONS.create,
    label: 'Create ticket',
    description:
      "A ticket in the pipeline, for the run's customer and the conversation it started on",
    fields: [
      {
        key: 'pipelineId',
        label: 'Pipeline',
        type: 'plugin_record',
        recordType: 'pipeline',
        required: true,
      },
      { key: 'name', label: 'Ticket name', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'longtext', required: false },
      {
        key: 'priority',
        label: 'Priority',
        type: 'select',
        options: PRIORITY_OPTIONS,
        required: false,
      },
    ],
    outputs: [text('ticketId', 'Ticket ID'), text('number', 'Ticket number')],
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
    outputs: SENT,
  })),
];
