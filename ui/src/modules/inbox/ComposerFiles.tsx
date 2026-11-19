import { IconPaperclip, IconX } from '@tabler/icons-react';
import { Button, Spinner, useUpload } from 'erxes-ui';
import { type ClipboardEvent, type DragEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Attachment, FileList, listOf, PickFiles } from '~/shared/Files.tsx';

/** A file picked, pasted or dropped, until core's storage holds it, and the tab it goes to. */
type Pending = { id: string; file: File; note: boolean };

/**
 * One file on its way to core's storage, as a line with a spinner, gone once it lands
 * (`onLanded`). A file that fails stays, saying so beside Remove, so the member sees which one
 * didn't go. Each file uploads on its own, since erxes-ui's `useUpload` stops loading when the
 * first of several lands and calls nothing on a failure.
 */
const PendingFile = ({
  file,
  hidden,
  onLanded,
  onRemove,
}: {
  file: File;
  hidden: boolean;
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
      files: listOf([file]),
      afterUpload: ({ response, fileInfo }) =>
        onLanded({ url: response, name: fileInfo.name, type: fileInfo.type, size: fileInfo.size }),
    });
  };

  if (failed)
    return (
      <li hidden={hidden} className="flex items-center gap-2 text-sm text-destructive-text">
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
    <li
      ref={start}
      hidden={hidden}
      className="flex items-center gap-2 text-sm text-muted-foreground"
    >
      <Spinner
        size="sm"
        aria-label={t('uploading-name', 'Uploading {{name}}', { name: file.name })}
      />
      <span className="truncate">{file.name}</span>
    </li>
  );
};

/**
 * The composer's files: picked from the paperclip, pasted, or dropped on the card. Each shows with
 * a spinner while it uploads and lands in the tab it was added in, `note` or reply, even when the
 * member has switched since. `uploading` holds the open tab's Send until each of its files has
 * landed or a failed one is removed.
 * `cardHandlers` go on the card, where they catch a paste or a drop of files before the editor.
 */
export const useComposerFiles = (
  note: boolean,
  onUploaded: (note: boolean, file: Attachment) => void,
) => {
  const [pending, setPending] = useState<Pending[]>([]);
  // BlockNote passes a drop beside its text on to the editor again, with the same data.
  const [taken] = useState(() => new WeakSet<DataTransfer>());

  const add = (files: File[]) =>
    setPending((current) => [
      ...current,
      ...files.map((file) => ({ id: crypto.randomUUID(), file, note })),
    ]);

  const take = (event: ClipboardEvent | DragEvent, data: DataTransfer | null) => {
    const files = Array.from(data?.files ?? []);

    if (!data || files.length === 0) return;

    event.preventDefault();
    event.stopPropagation();

    if (taken.has(data)) return;

    taken.add(data);
    add(files);
  };

  return {
    note,
    pending,
    uploading: pending.some((entry) => entry.note === note),
    add,
    landed: ({ id, note: tab }: Pending, attachment: Attachment) => {
      setPending((current) => current.filter((other) => other.id !== id));
      onUploaded(tab, attachment);
    },
    remove: (id: string) => setPending((current) => current.filter((other) => other.id !== id)),
    cardHandlers: {
      onPasteCapture: (event: ClipboardEvent) => take(event, event.clipboardData),
      onDragOver: (event: DragEvent) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault();
      },
      onDropCapture: (event: DragEvent) => take(event, event.dataTransfer),
    },
  };
};

type ComposerFiles = ReturnType<typeof useComposerFiles>;

/**
 * The open tab's files attached so far, each with Remove, then those still uploading. The other
 * tab's uploads stay mounted but hidden, so they still land.
 */
export const AttachedFiles = ({
  files,
  attachments,
  onRemove,
}: {
  files: ComposerFiles;
  attachments: Attachment[];
  onRemove: (file: Attachment) => void;
}) => {
  const shown = attachments.length > 0 || files.uploading;

  return (
    <div hidden={!shown} className="flex flex-col gap-1 px-3">
      <FileList files={attachments} onRemove={onRemove} />
      {files.pending.length > 0 && (
        <ul className="flex flex-col gap-1">
          {files.pending.map((entry) => (
            <PendingFile
              key={entry.id}
              file={entry.file}
              hidden={entry.note !== files.note}
              onLanded={(attachment) => files.landed(entry, attachment)}
              onRemove={() => files.remove(entry.id)}
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

  return (
    <PickFiles
      label={t('attach-file', 'Attach file')}
      icon={<IconPaperclip />}
      multiple
      onPick={files.add}
    />
  );
};
