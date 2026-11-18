import { IconPaperclip, IconX } from '@tabler/icons-react';
import { Button, IconTip, Spinner, useUpload } from 'erxes-ui';
import { type ClipboardEvent, type DragEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Attachment, FileList } from '~/shared/Files.tsx';

/** A file picked, pasted or dropped, until core's storage holds it. */
type Pending = { id: string; file: File };

/** One file as a `FileList`, the shape `useUpload` takes. */
const listOf = (file: File) => {
  const data = new DataTransfer();

  data.items.add(file);

  return data.files;
};

/**
 * One file on its way to core's storage, as a line with a spinner, gone once it lands
 * (`onLanded`). A file that fails stays, saying so beside Remove, so the member sees which one
 * didn't go. Each file uploads on its own, since erxes-ui's `useUpload` stops loading when the
 * first of several lands and calls nothing on a failure.
 */
const PendingFile = ({
  file,
  onLanded,
  onRemove,
}: {
  file: File;
  onLanded: (attachment: Attachment) => void;
  onRemove: () => void;
}) => {
  const { t } = useTranslation('frontline');
  const { upload, isLoading } = useUpload();
  const begun = useRef(false);
  const [started, setStarted] = useState(false);
  const failed = started && !isLoading;

  // The upload starts once the line is on the page.
  const start = (node: HTMLLIElement | null) => {
    if (!node || begun.current) return;

    begun.current = true;
    setStarted(true);
    upload({
      files: listOf(file),
      afterUpload: ({ response, fileInfo }) =>
        onLanded({ url: response, name: fileInfo.name, type: fileInfo.type, size: fileInfo.size }),
    });
  };

  if (failed)
    return (
      <li className="flex items-center gap-2 text-sm text-destructive-text">
        <span className="truncate">
          {t('upload-failed-name', 'Could not upload {{name}}', { name: file.name })}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto"
          aria-label={t('remove-file', 'Remove {{name}}', { name: file.name })}
          onClick={onRemove}
        >
          <IconX />
        </Button>
      </li>
    );

  return (
    <li ref={start} className="flex items-center gap-2 text-sm text-muted-foreground">
      <Spinner
        size="sm"
        aria-label={t('uploading-name', 'Uploading {{name}}', { name: file.name })}
      />
      <span className="truncate">{file.name}</span>
    </li>
  );
};

/** The files a paste or a drop carries, if any. */
const filesOf = (data: DataTransfer | null) => Array.from(data?.files ?? []);

/**
 * The composer's files: picked from the paperclip, pasted, or dropped on the card. Each shows with
 * a spinner while it uploads, and `uploading` holds Send until every one has landed or a failed
 * one is removed.
 * `cardHandlers` go on the card, where they catch a paste or a drop of files before the editor.
 */
export const useComposerFiles = (onUploaded: (file: Attachment) => void) => {
  const [pending, setPending] = useState<Pending[]>([]);

  const add = (files: File[]) =>
    setPending((current) => [
      ...current,
      ...files.map((file) => ({ id: crypto.randomUUID(), file })),
    ]);

  const take = (event: ClipboardEvent | DragEvent, files: File[]) => {
    if (files.length === 0) return;

    event.preventDefault();
    event.stopPropagation();
    add(files);
  };

  return {
    pending,
    uploading: pending.length > 0,
    add,
    landed: (id: string, attachment: Attachment) => {
      setPending((current) => current.filter((other) => other.id !== id));
      onUploaded(attachment);
    },
    remove: (id: string) => setPending((current) => current.filter((other) => other.id !== id)),
    cardHandlers: {
      onPasteCapture: (event: ClipboardEvent) => take(event, filesOf(event.clipboardData)),
      onDragOver: (event: DragEvent) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
      },
      onDropCapture: (event: DragEvent) => take(event, filesOf(event.dataTransfer)),
    },
  };
};

type ComposerFiles = ReturnType<typeof useComposerFiles>;

/** The files attached so far, each with Remove, then those still uploading. */
export const AttachedFiles = ({
  files,
  attachments,
  onRemove,
}: {
  files: ComposerFiles;
  attachments: Attachment[];
  onRemove: (file: Attachment) => void;
}) => {
  if (attachments.length === 0 && files.pending.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-3">
      <FileList files={attachments} onRemove={onRemove} />
      {files.pending.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.pending.map(({ id, file }) => (
            <PendingFile
              key={id}
              file={file}
              onLanded={(attachment) => files.landed(id, attachment)}
              onRemove={() => files.remove(id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
};

/** The paperclip: picks one file or several. */
export const AttachButton = ({ files }: { files: ComposerFiles }) => {
  const { t } = useTranslation('frontline');
  const input = useRef<HTMLInputElement>(null);
  const label = t('attach-file', 'Attach file');

  return (
    <>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label={label}
        onChange={(event) => {
          files.add(Array.from(event.target.files ?? []));
          event.target.value = '';
        }}
      />
      <IconTip label={label}>
        <Button
          type="button"
          variant="ghost"
          tone="muted"
          size="icon"
          aria-label={label}
          onClick={() => input.current?.click()}
        >
          <IconPaperclip />
        </Button>
      </IconTip>
    </>
  );
};
