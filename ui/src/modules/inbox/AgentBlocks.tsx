import { IconCreditCard, IconExternalLink } from '@tabler/icons-react';
import { buttonVariants } from 'erxes-ui';
import { useTranslation } from 'react-i18next';
import type { Message } from './queries.ts';

type Block = Message['blocks'][number];

const BlockView = ({ block }: { block: Block }) => {
  const { t } = useTranslation('frontline');

  switch (block.kind) {
    case 'image':
      return (
        <img
          src={block.url}
          alt={block.alt ?? ''}
          loading="lazy"
          className="max-h-56 max-w-72 rounded-lg border object-cover"
        />
      );
    case 'product':
      return (
        <div className="flex w-64 flex-col overflow-hidden rounded-lg border bg-background text-sm">
          {block.imageUrl && (
            <img
              src={block.imageUrl}
              alt={block.title}
              loading="lazy"
              className="h-36 w-full object-cover"
            />
          )}
          <div className="flex flex-col gap-1 p-3">
            <span className="font-medium">{block.title}</span>
            {block.price && <span>{block.price}</span>}
            {block.text && <span className="text-muted-foreground">{block.text}</span>}
            {block.url && (
              <a
                href={block.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-primary-text underline"
              >
                <IconExternalLink aria-hidden className="size-4" />
                {t('view-product', 'View product')}
              </a>
            )}
          </div>
        </div>
      );
    case 'link':
      return (
        <a
          href={block.url}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ size: 'sm', variant: 'outline' })}
        >
          <IconExternalLink />
          {block.title}
        </a>
      );
    case 'payment':
      return (
        <a
          href={block.url}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ size: 'sm' })}
        >
          <IconCreditCard />
          {block.amount ? `${block.title} · ${block.amount}` : block.title}
        </a>
      );
  }
};

/** What a core agent showed below its answer, as the customer's messenger shows it. */
export const AgentBlocks = ({ blocks }: { blocks: Block[] }) =>
  blocks.length > 0 && (
    <ul className="flex flex-col items-end gap-2">
      {blocks.map((block) => (
        // Core sends each block once, so its content is its key.
        <li key={JSON.stringify(block)} className="flex">
          <BlockView block={block} />
        </li>
      ))}
    </ul>
  );
