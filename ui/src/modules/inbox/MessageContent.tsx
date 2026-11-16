import { IconFile } from '@tabler/icons-react';
import { cn } from 'erxes-ui';
import parse from 'html-react-parser';
import type { Message } from './queries.ts';

/**
 * What the message says: a member's rich text as the API sanitized it (`api/src/modules/inbox/html.ts`),
 * else its plain text.
 */
export const MessageBody = ({ message }: { message: Message }) => {
  const fromCustomer = Boolean(message.customerId);

  const bot = !fromCustomer && !message.userId;

  const className = cn(
    'break-words rounded-2xl px-3 py-2 text-sm',
    fromCustomer && 'rounded-tl-sm bg-muted',
    !fromCustomer && 'rounded-tr-sm',
    !fromCustomer && !message.internal && !bot && 'bg-primary text-primary-foreground',
    bot && !message.internal && 'border border-primary/40 bg-primary/5',
    message.internal && 'border border-dashed border-warning bg-warning/20',
  );

  if (!message.html)
    return <p className={cn('whitespace-pre-wrap', className)}>{message.content}</p>;

  return (
    <div
      className={cn(
        className,
        'flex flex-col gap-1 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_[data-inline-content-type=mention]]:font-semibold',
      )}
    >
      {parse(message.html)}
    </div>
  );
};

/** The message's files: images as thumbnails, the rest as chips with their name. */
export const Attachments = ({ files }: { files: Message['attachments'] }) => {
  if (files.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((file) => (
        <li key={file.url}>
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="flex max-w-60 items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs hover:bg-accent"
          >
            {file.type?.startsWith('image/') ? (
              <img src={file.url} alt={file.name} className="max-h-40 rounded-sm" />
            ) : (
              <>
                <IconFile className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{file.name}</span>
              </>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
};
