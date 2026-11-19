import { IconExternalLink, IconFile } from '@tabler/icons-react';
import { Button, cn, Dialog } from 'erxes-ui';
import parse from 'html-react-parser';
import { useTranslation } from 'react-i18next';
import { type Message, useLinkPreviews } from './queries.ts';

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

type File = Message['attachments'][number];

/**
 * An image as a thumbnail; a click shows it whole over the page, as the old inbox did, with a
 * link to the file itself.
 */
const ImageFile = ({ file }: { file: File }) => {
  const { t } = useTranslation('frontline');

  return (
    <Dialog>
      <Dialog.Trigger
        render={
          <Button
            variant="ghost"
            size="flush"
            aria-label={t('view-image', 'View {{name}}', { name: file.name })}
          />
        }
      >
        <img
          src={file.url}
          alt={file.name}
          loading="lazy"
          className="max-h-40 max-w-60 rounded-md border object-cover"
        />
      </Dialog.Trigger>
      <Dialog.Content className="max-w-6xl">
        <div className="flex max-h-svh min-w-0 flex-col gap-3">
          <Dialog.Title>{file.name}</Dialog.Title>
          <img
            src={file.url}
            alt={file.name}
            className="min-h-0 self-center rounded-md object-contain"
          />
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 self-end text-xs text-muted-foreground hover:underline"
          >
            <IconExternalLink className="size-3.5" aria-hidden />
            {t('open-original', 'Open the original')}
          </a>
        </div>
      </Dialog.Content>
    </Dialog>
  );
};

/**
 * The message's files: images as thumbnails that open whole, the rest as chips with their name.
 * A Meta photo's type is the bare `image`.
 */
export const Attachments = ({ files }: { files: Message['attachments'] }) => {
  if (files.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((file) => (
        <li key={file.url}>
          {file.type?.split('/')[0] === 'image' ? (
            <ImageFile file={file} />
          ) : (
            <a
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="flex max-w-60 items-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-xs hover:bg-accent"
            >
              <IconFile className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{file.name}</span>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
};

/** A card for each web link in the message, with the page's site, title, description and image. */
export const LinkPreviews = ({ message }: { message: Message }) => {
  const previews = useLinkPreviews(message).data?.previews ?? [];

  if (previews.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {previews.map((preview) => (
        <li key={preview.url}>
          <a
            href={preview.url}
            target="_blank"
            rel="noreferrer"
            className="flex max-w-sm gap-3 rounded-md border bg-background p-2 text-xs hover:bg-accent"
          >
            {preview.image && (
              <img
                src={preview.image}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="size-16 shrink-0 rounded-sm object-cover"
              />
            )}
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-muted-foreground">{preview.siteName}</span>
              <span className="line-clamp-2 font-medium">{preview.title}</span>
              {preview.description && (
                <span className="line-clamp-2 text-muted-foreground">{preview.description}</span>
              )}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
};
