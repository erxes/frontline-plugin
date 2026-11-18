import type { InferClientOutputs } from '@orpc/client';
import type { Client } from '@frontline/api';
import { IconFile, IconUpload, IconX } from '@tabler/icons-react';
import { Button, IconTip, Upload, useUpload } from 'erxes-ui';
import { type ReactNode, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/** A file on core's storage, as every record with files stores it (`api/src/db/table.ts`). */
export type Attachment = InferClientOutputs<Client>['tickets']['get']['attachments'][number];

/** One image: its preview uploads or changes it, the remove button clears it to `null`. */
export const ImageField = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (file: Attachment | null) => void;
}) => (
  <Upload.Root
    value={value}
    onChange={({ url, name, type, size }) =>
      onChange(url ? { url, name: name ?? url, type, size } : null)
    }
  >
    <Upload.Preview />
    {value && <Upload.RemoveButton type="button" variant="ghost" />}
  </Upload.Root>
);

/** Files as a `FileList`, the shape `useUpload` takes. */
export const listOf = (files: File[]) => {
  const data = new DataTransfer();

  for (const file of files) data.items.add(file);

  return data.files;
};

/**
 * A button that opens the file dialog and hands over the files picked; `accept` names the types
 * it takes, `multiple` lets it take several. Given an `icon`, it is that icon alone with `label`
 * on hover, as a composer's tools are.
 */
export const PickFiles = ({
  label,
  accept,
  multiple,
  icon,
  busy,
  onPick,
}: {
  label: string;
  accept?: string;
  multiple?: boolean;
  icon?: ReactNode;
  busy?: boolean;
  onPick: (files: File[]) => void;
}) => {
  const input = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        aria-label={label}
        onChange={(event) => {
          const picked = Array.from(event.target.files ?? []);

          // Cleared, so picking the same file again still counts.
          event.target.value = '';
          onPick(picked);
        }}
      />
      {icon ? (
        <IconTip label={label}>
          <Button
            type="button"
            variant="ghost"
            tone="muted"
            size="icon"
            aria-label={label}
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {icon}
          </Button>
        </IconTip>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="self-start"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <IconUpload />
          {label}
        </Button>
      )}
    </>
  );
};

/** `PickFiles` that uploads the file picked to core's storage and hands over what it stored. */
export const FilePicker = ({
  onUploaded,
  ...button
}: {
  label: string;
  accept?: string;
  icon?: ReactNode;
  onUploaded: (file: Attachment) => void;
}) => {
  const { upload, isLoading } = useUpload();

  return (
    <PickFiles
      {...button}
      busy={isLoading}
      onPick={(files) =>
        upload({
          files: listOf(files),
          afterUpload: ({ response, fileInfo }) =>
            onUploaded({
              url: response,
              name: fileInfo.name,
              type: fileInfo.type,
              size: fileInfo.size,
            }),
        })
      }
    />
  );
};

/**
 * Files as links that open them in a new tab: an image as its thumbnail, the rest by name. Given
 * `onRemove`, each has a button that takes it off the list.
 */
export const FileList = ({
  files,
  onRemove,
}: {
  files: Attachment[];
  onRemove?: (file: Attachment) => void;
}) => {
  const { t } = useTranslation('frontline');

  if (files.length === 0) return null;

  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((file) => (
        <li
          key={file.url}
          className="flex max-w-60 items-center gap-0.5 rounded-md border bg-background text-xs"
        >
          <a
            href={file.url}
            target="_blank"
            rel="noreferrer"
            className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent"
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
          {onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={t('remove-file', 'Remove {{name}}', { name: file.name })}
              onClick={() => onRemove(file)}
            >
              <IconX />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
};
