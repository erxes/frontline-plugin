import type { AgentBlock } from '@erxes/core-contract';

/** The most characters Meta shows in a card's title or subtitle. */
const CARD_TEXT = 80;

/** The most characters Meta takes in a button template's text. */
const BUTTON_TEXT = 640;

/**
 * One message that shows agent blocks on Messenger or Instagram, in Meta's own form, and the
 * text with their links it goes as when Meta refuses that form.
 */
export interface BlockMessage {
  message: Record<string, unknown>;
  fallback: string;
}

type Product = Extract<AgentBlock, { kind: 'product' }>;

/** `text` cut to `max` characters, ending in an ellipsis when it was longer. */
const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

const template = (payload: Record<string, unknown>) => ({
  attachment: { type: 'template', payload },
});

const urlButton = (url: string, title: string) => ({ type: 'web_url', url, title });

/** A product's line of text: its title and price. */
const productLine = (product: Product) =>
  [product.title, product.price].filter(Boolean).join(' · ');

/**
 * The products as one generic template, a carousel of a card each. A card shows the price and
 * text under the title, the picture, and opens the product's page, which its View button
 * names. Core sends 10 blocks at most, as many cards as a carousel takes.
 */
const carousel = (products: Product[]): BlockMessage => ({
  message: template({
    template_type: 'generic',
    elements: products.map((product) => {
      const subtitle = [product.price, product.text].filter(Boolean).join(' · ');

      return {
        title: clip(product.title, CARD_TEXT),
        ...(subtitle && { subtitle: clip(subtitle, CARD_TEXT) }),
        ...(product.imageUrl && { image_url: product.imageUrl }),
        ...(product.url && {
          default_action: { type: 'web_url', url: product.url },
          buttons: [urlButton(product.url, 'View')],
        }),
      };
    }),
  }),
  fallback: products
    .map((product) => [productLine(product), product.url].filter(Boolean).join('\n'))
    .join('\n\n'),
});

/** A button template: the text, and one button that opens `url`. */
const button = (text: string, url: string, title: string): BlockMessage => ({
  message: template({
    template_type: 'button',
    text: clip(text, BUTTON_TEXT),
    buttons: [urlButton(url, title)],
  }),
  fallback: `${text}\n${url}`,
});

/**
 * The messages that show an agent's blocks on Messenger and Instagram, in the blocks' order. A
 * picture goes as an image; the products go together as one carousel, where the first one was;
 * a link or a payment page goes as a button that opens it.
 */
export const blockMessages = (blocks: AgentBlock[]) => {
  const products = blocks.filter((block) => block.kind === 'product');

  return blocks.flatMap((block): BlockMessage[] => {
    switch (block.kind) {
      case 'image':
        return [
          {
            message: { attachment: { type: 'image', payload: { url: block.url } } },
            fallback: block.alt ? `${block.alt}\n${block.url}` : block.url,
          },
        ];
      case 'product':
        return block === products[0] ? [carousel(products)] : [];
      case 'link':
        return [button(block.title, block.url, 'Open')];
      case 'payment':
        return [
          button(block.amount ? `${block.title} · ${block.amount}` : block.title, block.url, 'Pay'),
        ];
    }
  });
};
