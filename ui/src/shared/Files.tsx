import type { InferClientOutputs } from '@orpc/client';
import type { Client } from '@frontline/api';
import { IconFile, IconUpload, IconX } from '@tabler/icons-react';
import { Button, Upload, useUpload } from 'erxes-ui';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

/** A file on core's storage, as every record with files stores it (`api/src/db/table.ts`). */
type Attachment = InferClientOutputs<Client>['tickets']['get']['attachments'][number];

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

/** A button that uploads the file picked; `accept` names the types it takes. */
export const FilePicker = ({
  label,
  accept,
  onUploaded,
}: {
  label: string;
  accept?: string;
  onUploaded: (file: Attachment) => void;
}) => {
  const input = useRef<HTMLInputElement>(null);
  const { upload, isLoading } = useUpload();

  return (
    <>
      <input
        ref={input}
        type="file"
        hidden
        accept={accept}
        aria-label={label}
        onChange={(event) =>
          upload({
            files: event.target.files,
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
      <Button
        type="button"
        variant="outline"
        className="self-start"
        disabled={isLoading}
        onClick={() => input.current?.click()}
      >
        <IconUpload />
        {label}
      </Button>
    </>
  );
};

/** Uploaded files by name, each with a button that takes it off the list. */
export const FileList = ({
  files,
  onRemove,
}: {
  files: Attachment[];
  onRemove: (file: Attachment) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <ul className="flex flex-col gap-1">
      {files.map((file) => (
        <li key={file.url} className="flex items-center gap-2 text-sm">
          <IconFile className="text-muted-foreground size-4 shrink-0" />
          <span className="truncate">{file.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ml-auto"
            aria-label={t('remove-file', 'Remove {{name}}', { name: file.name })}
            onClick={() => onRemove(file)}
          >
            <IconX />
          </Button>
        </li>
      ))}
    </ul>
  );
};
