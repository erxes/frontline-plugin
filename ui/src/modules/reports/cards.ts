import type { Section } from './period.ts';
import type { CardSpec } from './cardKit.ts';
import { CALL_CARDS } from './callCards.ts';
import { CALL_SERVICE_CARDS } from './callServiceCards.ts';
import { CONVERSATION_CARDS, META_CARDS } from './conversationCards.ts';
import { TICKET_CARDS } from './ticketCards.ts';

export type { CardBody, CardInput, CardSpec, Records } from './cardKit.ts';

/** Each report page's cards, in the order a member first sees them. */
export const CARDS: Record<Section, CardSpec[]> = {
  conversations: CONVERSATION_CARDS,
  tickets: TICKET_CARDS,
  meta: META_CARDS,
  calls: [...CALL_CARDS, ...CALL_SERVICE_CARDS],
};
