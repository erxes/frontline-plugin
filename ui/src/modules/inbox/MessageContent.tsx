import { IconClock, IconExternalLink, IconFile } from '@tabler/icons-react';
import { Button, cn, Dialog, editorText } from 'erxes-ui';
import parse from 'html-react-parser';
import { useTranslation } from 'react-i18next';
import type { Sending } from './changes.ts';
import { type Message, useLinkPreviews } from './queries.ts';

/** A line of an email's quoted history: `>` marks, one per level, before the text. */
const QUOTED = /^\s*>/;

/**
 * Where a plain-text email's quoted history starts: its last lines that are all `>` lines or
 * blank, with the "On … wrote:" line before them. -1 when there is none, or when the whole text is
 * quoted, so a forward still shows.
 */
const quoteStart = (lines: string[]) => {
  let start = -1;
  let index = lines.length - 1;

  for (; index >= 0; index -= 1) {
    const line = lines[index] ?? '';

    if (QUOTED.test(line)) start = index;
    else if (line.trim()) break;
  }

  if (start === -1) return -1;

  // The attribution, which ends with a colon in every language's mail client.
  if ((lines[index] ?? '').trim().endsWith(':')) start = index;

  return lines.slice(0, start).some((line) => line.trim()) ? start : -1;
};

/** The history an email quotes, without its `>` marks, under a ••• button that shows it. */
const QuotedHistory = ({ lines }: { lines: string[] }) => {
  const { t } = useTranslation('frontline');
  const label = t('show-quoted-text', 'Show quoted text');

  return (
    <details className="group/quote">
      <summary
        title={label}
        aria-label={label}
        className="mt-1 inline-flex cursor-pointer list-none rounded-full bg-background/60 px-2 text-xs leading-5 tracking-widest text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
      >
        •••
      </summary>
      <span className="mt-2 block border-l-2 pl-3 text-muted-foreground">
        {lines.map((line) => line.replace(/^(\s*>)+ ?/, '')).join('\n')}
      </span>
    </details>
  );
};

/** Plain text as written, line breaks kept, an email's quoted history folded under its reply. */
const PlainText = ({ content, className }: { content: string; className: string }) => {
  const lines = content.split('\n');
  const start = quoteStart(lines);

  return (
    <div className={cn('whitespace-pre-wrap', className)}>
      {start === -1 ? (
        content
      ) : (
        <>
          {lines.slice(0, start).join('\n').trimEnd()}
          <QuotedHistory lines={lines.slice(start)} />
        </>
      )}
    </div>
  );
};

/**
 * What the message says: a member's rich text as the API sanitized it (`api/src/modules/inbox/html.ts`),
 * else its plain text. The first of a run points at its author with one square corner; the rest
 * of the run are rounded all round. A long link or word wraps inside the bubble instead of
 * stretching it, and an email's images and tables keep to its width.
 */
export const MessageBody = ({
  message,
  first = true,
}: {
  message: Pick<Message, 'customerId' | 'userId' | 'internal' | 'html' | 'content'>;
  first?: boolean;
}) => {
  const fromCustomer = Boolean(message.customerId);

  const bot = !fromCustomer && !message.userId;

  const className = cn(
    'min-w-0 max-w-full rounded-2xl px-3.5 py-2 text-sm leading-relaxed wrap-anywhere',
    first && fromCustomer && 'rounded-tl-sm',
    first && !fromCustomer && 'rounded-tr-sm',
    fromCustomer && 'bg-muted',
    !fromCustomer && !message.internal && !bot && 'bg-primary text-primary-foreground',
    bot && !message.internal && 'border border-primary/40 bg-primary/5',
    message.internal && 'border border-dashed border-warning bg-warning/20',
  );

  if (!message.html) return <PlainText content={message.content} className={className} />;

  return (
    <div
      className={cn(
        className,
        'flex flex-col gap-1 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_img]:h-auto [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:whitespace-pre-wrap [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_ul]:list-disc [&_ul]:pl-5 [&_[data-inline-content-type=mention]]:font-semibold',
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
          className="max-h-56 max-w-72 rounded-lg border object-cover transition-opacity hover:opacity-90"
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

/** A file's extension in capitals, such as PDF, for the line under its name; none without one. */
const extensionOf = (name: string) => {
  const dot = name.lastIndexOf('.');

  return dot > 0 ? name.slice(dot + 1).toUpperCase() : '';
};

/** A file that isn't media, as a card with its icon, name and type, opening it in a new tab. */
const FileCard = ({ file }: { file: File }) => (
  <a
    href={file.url}
    target="_blank"
    rel="noreferrer"
    title={file.name}
    className="flex max-w-72 items-center gap-2.5 rounded-lg border bg-background p-2 pr-3 text-xs hover:bg-accent"
  >
    <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
      <IconFile className="size-4" aria-hidden />
    </span>
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{file.name}</span>
      {extensionOf(file.name) && (
        <span className="text-muted-foreground">{extensionOf(file.name)}</span>
      )}
    </span>
  </a>
);

/**
 * The message's files: images as thumbnails that open whole, a video or a recording as its
 * player, and the rest as cards with their name and type. A Meta photo's type is the bare `image`.
 */
export const Attachments = ({ files }: { files: Message['attachments'] }) => {
  if (files.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((file) => {
        const media = file.type?.split('/')[0];

        return (
          <li key={file.url}>
            {media === 'image' && <ImageFile file={file} />}
            {media === 'video' && (
              <video
                controls
                preload="metadata"
                src={file.url}
                aria-label={file.name}
                className="max-h-56 max-w-72 rounded-lg border"
              >
                <track kind="captions" />
              </video>
            )}
            {media === 'audio' && (
              <audio controls preload="metadata" src={file.url} aria-label={file.name}>
                <track kind="captions" />
              </audio>
            )}
            {media !== 'image' && media !== 'video' && media !== 'audio' && (
              <FileCard file={file} />
            )}
          </li>
        );
      })}
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
            className="flex max-w-sm gap-3 rounded-lg border bg-background p-2 text-xs hover:bg-accent"
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

/**
 * The member's message while the API saves it, on the right as it will show, faded, its text
 * plain until the saved one replaces it. A refused one goes, and the composer gets it back.
 */
export const SendingMessage = ({ sending }: { sending: Sending }) => {
  const { t } = useTranslation('frontline');
  const internal = sending.internal ?? false;

  return (
    <article
      aria-label={t('message-sending', 'Message on its way')}
      aria-busy
      className="flex flex-col items-end gap-1 pb-6 opacity-60"
    >
      <MessageBody
        message={{
          customerId: null,
          // Any member's id draws the team's bubble; whose it is shows once it is saved.
          userId: 'sending',
          internal,
          html: null,
          content: editorText(sending.html ?? '') || sending.content || '',
        }}
      />
      <Attachments files={sending.attachments ?? []} />
      {!internal && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <IconClock className="size-3" aria-hidden />
          {t('sending', 'Sending')}
        </span>
      )}
    </article>
  );
};
