import { useRef, useState } from 'preact/hooks';
import type { Uploaded } from './http.ts';
import { AttachIcon } from './icons.tsx';

/** What went wrong, in words a visitor reads. */
export const messageOf = (failure: unknown) =>
  failure instanceof Error ? failure.message : 'Something went wrong';

/**
 * Files the visitor attaches, each uploaded as they pick it, after the `initial` ones; a refused
 * one names why.
 */
export const useUploads = (upload: (file: File) => Promise<Uploaded>, initial: Uploaded[] = []) => {
  const [files, setFiles] = useState(initial);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const attach = async (picked: FileList | null) => {
    setError(null);

    await Promise.all(
      [...(picked ?? [])].map(async (file) => {
        setUploading((count) => count + 1);

        try {
          const uploaded = await upload(file);

          setFiles((list) => [...list, uploaded]);
        } catch (failure) {
          setError(`${file.name}: ${messageOf(failure)}`);
        } finally {
          setUploading((count) => count - 1);
        }
      }),
    );
  };

  const remove = (file: Uploaded) => setFiles((list) => list.filter((item) => item !== file));

  return { files, uploading, error, attach, remove, clear: () => setFiles([]) };
};

export type Uploads = ReturnType<typeof useUploads>;

/** The paper clip that opens the file picker. */
export const AttachButton = ({ uploads }: { uploads: Uploads }) => {
  const picker = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={picker}
        type="file"
        multiple
        hidden
        aria-label="Attach files"
        onChange={(event) => {
          void uploads.attach(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <button
        type="button"
        class="fl-icon-button"
        aria-label="Attach a file"
        onClick={() => picker.current?.click()}
      >
        <AttachIcon />
      </button>
    </>
  );
};

/** The attached files by name, each with a button that takes it off, and why one was refused. */
export const FileChips = ({ uploads }: { uploads: Uploads }) => (
  <>
    {uploads.error && (
      <p class="fl-error" role="alert">
        {uploads.error}
      </p>
    )}
    {(uploads.files.length > 0 || uploads.uploading > 0) && (
      <ul class="fl-chips" aria-label="Attached files">
        {uploads.files.map((file) => (
          <li key={file.url}>
            {file.name}
            <button
              type="button"
              aria-label={`Remove ${file.name}`}
              onClick={() => uploads.remove(file)}
            >
              ×
            </button>
          </li>
        ))}
        {uploads.uploading > 0 && <li>Uploading…</li>}
      </ul>
    )}
  </>
);
