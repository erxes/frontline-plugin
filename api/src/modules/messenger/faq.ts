import { withOrg } from '#/db/client.ts';
import { addBotMessage } from '../inbox/operator.ts';
import { signalConversations } from '../inbox/shared.ts';
import type { MessengerConfig } from './adapter.ts';

/** Text as a question compares: trimmed, case-folded, without the punctuation it ends with. */
const comparable = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[\s\p{P}]+$/u, '');

/** The saved answer to the common question `text` asks exactly, as `comparable` reads both. */
export const faqAnswerTo = (faq: MessengerConfig['faq'], text: string) => {
  const asked = comparable(text);

  return asked ? faq.find((entry) => comparable(entry.question) === asked)?.answer : undefined;
};

/**
 * Posts a common question's saved answer as the bot, right after the visitor's message that
 * asked it, and tells the inbox and the visitor's messenger. It leaves who answers the
 * conversation as it was. A second try for the same message adds nothing.
 */
export const postFaqAnswer = (
  orgId: string,
  message: { id: string; conversationId: string; customerId: string },
  answer: string,
) =>
  withOrg(orgId, async (tx) => {
    const conversation = { id: message.conversationId, customerId: message.customerId };

    if (await addBotMessage(tx, orgId, conversation, answer, { externalId: `faq:${message.id}` }))
      await signalConversations(tx, orgId, [conversation]);
  });
