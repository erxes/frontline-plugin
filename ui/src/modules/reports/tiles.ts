// The report tiles `src/dashboardWidgets.ts` places on core's home dashboard, in one module so
// they load together when the first one shows.
import {
  CallAgents,
  CallHeatmap,
  CallNumbers,
  CallQueues,
  CallSummary,
  CallVolume,
} from './CallTiles.tsx';
import {
  ConversationResponders,
  ConversationsBySource,
  ConversationsByTag,
  ConversationsOverTime,
  ConversationSummary,
} from './ConversationTiles.tsx';
import { TicketsByAssignee, TicketSla } from './TicketTables.tsx';
import {
  TicketsByPriority,
  TicketsByStatus,
  TicketsByTag,
  TicketsOverTime,
  TicketSummary,
} from './TicketTiles.tsx';

/** Each tile by the widget `name` members' layouts save. */
export const TILES = {
  'ticket-summary': TicketSummary,
  'tickets-over-time': TicketsOverTime,
  'tickets-by-stage': TicketsByStatus,
  'tickets-by-priority': TicketsByPriority,
  'tickets-by-tag': TicketsByTag,
  'ticket-sla': TicketSla,
  'tickets-by-assignee': TicketsByAssignee,
  'conversation-summary': ConversationSummary,
  'conversations-over-time': ConversationsOverTime,
  'conversations-by-source': ConversationsBySource,
  'conversations-by-tag': ConversationsByTag,
  'conversation-responders': ConversationResponders,
  'call-summary': CallSummary,
  'call-volume': CallVolume,
  'call-heatmap': CallHeatmap,
  'call-agents': CallAgents,
  'call-queues': CallQueues,
  'call-numbers': CallNumbers,
};
