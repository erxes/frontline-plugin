import { useText } from '../../shared/text.ts';
import type { Message } from '../api.ts';
import styles from './blocks.css?inline';

type Block = Message['blocks'][number];

const BlockView = ({ block }: { block: Block }) => {
  const { t } = useText();

  switch (block.kind) {
    case 'image':
      return <img class="fl-block-image" src={block.url} alt={block.alt ?? ''} loading="lazy" />;
    case 'product':
      return (
        <div class="fl-product">
          {block.imageUrl && <img src={block.imageUrl} alt={block.title} loading="lazy" />}
          <div>
            <strong>{block.title}</strong>
            {block.price && <span>{block.price}</span>}
            {block.text && <span class="fl-product-text">{block.text}</span>}
            {block.url && (
              <a href={block.url} target="_blank" rel="noreferrer">
                {t('View product')}
              </a>
            )}
          </div>
        </div>
      );
    case 'link':
      return (
        <a class="fl-block-link" href={block.url} target="_blank" rel="noreferrer">
          {block.title}
        </a>
      );
    case 'payment':
      return (
        <a class="fl-pay" href={block.url} target="_blank" rel="noreferrer">
          {block.amount ? `${block.title} · ${block.amount}` : block.title}
        </a>
      );
  }
};

/**
 * What the messenger's core agent showed below its answer: pictures, products, links and payment
 * links. Its own chunk, fetched when a thread holds blocks, with its styles.
 */
export const AgentBlocks = ({ blocks }: { blocks: Block[] }) =>
  blocks.length > 0 && (
    <>
      <style>{styles}</style>
      <ul class="fl-blocks">
        {blocks.map((block) => (
          // Core sends each block once, so its content is its key.
          <li key={JSON.stringify(block)}>
            <BlockView block={block} />
          </li>
        ))}
      </ul>
    </>
  );
