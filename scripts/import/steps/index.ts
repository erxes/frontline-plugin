// Every step in the order it runs.
import type { Step } from '../step.ts';
import { ACCOUNT_STEPS } from './accounts.ts';
import { CALL_STEPS } from './calls.ts';
import { CONVERSATION_STEPS } from './conversations.ts';
import { CUSTOMER_STEPS } from './customers.ts';
import { FORM_STEPS } from './forms.ts';
import { INTEGRATION_STEPS } from './integrations.ts';
import { KNOWLEDGE_BASE_STEPS } from './knowledgebase.ts';
import { LEGACY_TICKET_STEPS } from './legacyTickets.ts';
import { MESSAGE_STEPS } from './messages.ts';
import { STRUCTURE_STEPS } from './structure.ts';
import { SURVEY_STEPS } from './surveys.ts';
import { TICKET_STEPS } from './tickets.ts';

/** Parents before children: every later step finds the rows the earlier ones gave. */
export const STEPS: Step[] = [
  ...STRUCTURE_STEPS,
  ...ACCOUNT_STEPS,
  ...INTEGRATION_STEPS,
  ...CUSTOMER_STEPS,
  ...CONVERSATION_STEPS,
  ...MESSAGE_STEPS,
  ...TICKET_STEPS,
  ...LEGACY_TICKET_STEPS,
  ...FORM_STEPS,
  ...KNOWLEDGE_BASE_STEPS,
  ...SURVEY_STEPS,
  ...CALL_STEPS,
];
