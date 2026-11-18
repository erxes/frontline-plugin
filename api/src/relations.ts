import type { PluginManifest } from '@erxes/core-contract';
import { PERMISSIONS } from '#/core.ts';
import { PRIORITY_NAMES } from '#/db/tickets.ts';

/**
 * What core's customer filter reads from frontline (the manifest's `relations`): each
 * customer's conversations, tickets and form submissions, from the views of
 * `drizzle/0018_customer_relations.sql`. "Conversations: count ≥ 1 where Source is
 * Instagram", "Tickets: latest Created in the last 7 days where Stage is Open". Choices are the
 * views' labels, as the UI names them.
 */

export const RELATIONS = [
  {
    key: 'conversations',
    contentType: 'customer',
    label: 'Conversations',
    view: 'frontline_customer_conversations',
    permission: PERMISSIONS.inboxView,
    fields: [
      { key: 'channel', label: 'Channel', type: 'text' },
      {
        key: 'source',
        label: 'Source',
        type: 'select',
        options: [
          'Messenger',
          'Facebook Messenger',
          'Instagram',
          'Telegram',
          'Discord',
          'Email',
          'Phone',
          'CallPro',
        ],
      },
      { key: 'integration', label: 'Integration', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['New', 'Open', 'Resolved'] },
      { key: 'assignee', label: 'Assignee', type: 'member' },
      { key: 'messages', label: 'Messages', type: 'number', measures: ['sum'] },
      { key: 'awaiting_reply', label: 'Awaiting reply', type: 'boolean' },
      { key: 'last_message_at', label: 'Last message', type: 'date', measures: ['max'] },
      { key: 'created_at', label: 'Started', type: 'date', measures: ['min', 'max'] },
    ],
  },
  {
    key: 'tickets',
    contentType: 'customer',
    label: 'Tickets',
    view: 'frontline_customer_tickets',
    permission: PERMISSIONS.channelView,
    fields: [
      {
        key: 'stage',
        label: 'Stage',
        type: 'select',
        options: ['New', 'Open', 'In progress', 'Resolved', 'Closed', 'Cancelled'],
      },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'pipeline', label: 'Pipeline', type: 'text' },
      {
        key: 'priority',
        label: 'Priority',
        type: 'select',
        options: PRIORITY_NAMES,
      },
      { key: 'assignee', label: 'Assignee', type: 'member' },
      { key: 'created_at', label: 'Created', type: 'date', measures: ['min', 'max'] },
      { key: 'resolved_at', label: 'Resolved', type: 'date', measures: ['max'] },
    ],
  },
  {
    key: 'form_submissions',
    contentType: 'customer',
    label: 'Form submissions',
    view: 'frontline_customer_form_submissions',
    permission: PERMISSIONS.channelView,
    fields: [
      { key: 'form', label: 'Form', type: 'text' },
      { key: 'submitted_at', label: 'Submitted', type: 'date', measures: ['min', 'max'] },
    ],
  },
] satisfies NonNullable<PluginManifest['relations']>;
