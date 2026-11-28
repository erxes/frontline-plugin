import type { PluginManifest } from '@erxes/core-contract';
import { CONVERSATION_TIMELINE, PERMISSIONS, TICKET_TIMELINE } from '#/core.ts';
import { PRIORITY_NAMES } from '#/db/tickets.ts';

/**
 * Frontline's record types that take Data Extensions fields (the manifest's `objects`): members
 * add fields to tickets and conversations in core, the record keeps the values in
 * `properties_data` by field id, and `dataValues.check` checks a patch against them. Core reads
 * each from its view in `drizzle/0052_record_fields.sql`: the values as `custom_fields`, and the
 * columns below for formulas and rollups.
 */
export const OBJECTS = [
  {
    type: TICKET_TIMELINE,
    label: 'Tickets',
    singularLabel: 'Ticket',
    icon: 'IconTicket',
    permission: PERMISSIONS.channelView,
    updatePermission: PERMISSIONS.channelView,
    view: 'frontline_ticket_fields',
    fields: [
      { key: 'number', label: 'Number', type: 'text' },
      { key: 'name', label: 'Name', type: 'text' },
      {
        key: 'stage',
        label: 'Stage',
        type: 'select',
        options: ['New', 'Open', 'In progress', 'Resolved', 'Closed', 'Cancelled'],
      },
      { key: 'status', label: 'Status', type: 'text' },
      { key: 'pipeline', label: 'Pipeline', type: 'text' },
      { key: 'priority', label: 'Priority', type: 'select', options: PRIORITY_NAMES },
      { key: 'assignee', label: 'Assignee', type: 'member' },
      { key: 'created_at', label: 'Created', type: 'date' },
      { key: 'start_date', label: 'Start date', type: 'date' },
      { key: 'target_date', label: 'Target date', type: 'date' },
      { key: 'resolved_at', label: 'Resolved', type: 'date' },
    ],
  },
  {
    type: CONVERSATION_TIMELINE,
    label: 'Conversations',
    singularLabel: 'Conversation',
    icon: 'IconMessages',
    permission: PERMISSIONS.inboxView,
    updatePermission: PERMISSIONS.conversationEditFields,
    view: 'frontline_conversation_fields',
    fields: [
      { key: 'channel', label: 'Channel', type: 'text' },
      { key: 'integration', label: 'Integration', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['New', 'Open', 'Resolved'] },
      { key: 'assignee', label: 'Assignee', type: 'member' },
      { key: 'messages', label: 'Messages', type: 'number' },
      { key: 'last_message_at', label: 'Last message', type: 'date' },
      { key: 'created_at', label: 'Started', type: 'date' },
    ],
  },
] satisfies NonNullable<PluginManifest['objects']>;
