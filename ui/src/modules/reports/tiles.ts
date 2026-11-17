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
import {
  TicketsByPriority,
  TicketsByStage,
  TicketsByTag,
  TicketsOverTime,
  TicketSummary,
} from './TicketTiles.tsx';

export const TILES = {
  TicketSummary,
  TicketsOverTime,
  TicketsByStage,
  TicketsByPriority,
  TicketsByTag,
  ConversationSummary,
  ConversationsOverTime,
  ConversationsBySource,
  ConversationsByTag,
  ConversationResponders,
  CallSummary,
  CallVolume,
  CallHeatmap,
  CallAgents,
  CallQueues,
  CallNumbers,
};
