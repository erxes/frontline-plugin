import type { OutboundMessage } from '../provider.ts';
import { blockMessages } from './metaBlocks.ts';
import { metaText } from './metaText.ts';

/**
 * A reply's text for a provider with no form for an agent's blocks: a member's as written; a
 * bot's answer flattened from markdown, unless the provider shows markdown, then each block it
 * showed as text with its link, so a product's page or a payment link still reaches the customer.
 */
export const botText = (
  { text, byBot, blocks }: Pick<OutboundMessage, 'text' | 'byBot' | 'blocks'>,
  { markdown = false }: { markdown?: boolean } = {},
) =>
  byBot
    ? [markdown ? text : metaText(text), ...blockMessages(blocks).map((block) => block.fallback)]
        .filter(Boolean)
        .join('\n\n')
    : text;
