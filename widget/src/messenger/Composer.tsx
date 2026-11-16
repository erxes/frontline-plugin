import { useRef, useState } from 'preact/hooks';
import type { Identity, Uploaded } from './api.ts';
import { SendIcon } from './icons.tsx';
import { AttachButton, FileChips, messageOf, useUploads } from './uploads.tsx';

/** How often the team hears that the visitor is still typing. */
const TYPING_EVERY_MS = 3000;

/**
 * Where the visitor writes: a message, files they attach (uploaded as they pick them), Enter to
 * send and Shift+Enter for a new line.
 */
export const Composer = ({
  onSend,
  onUpload,
  onTyping,
}: {
  onSend: (content: string, files: Uploaded[]) => Promise<void>;
  onUpload: (file: File) => Promise<Uploaded>;
  onTyping: () => void;
}) => {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploads = useUploads(onUpload);
  const typedAt = useRef(0);
  const busy = sending || uploads.uploading > 0;

  const submit = async () => {
    const content = text.trim();

    if ((!content && uploads.files.length === 0) || busy) return;

    setSending(true);
    setError(null);

    try {
      await onSend(content, uploads.files);
      setText('');
      uploads.clear();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setSending(false);
    }
  };

  return (
    <form
      class="fl-composer"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {error && (
        <p class="fl-error" role="alert">
          {error}
        </p>
      )}
      <FileChips uploads={uploads} />
      <div class="fl-compose-row">
        <textarea
          rows={1}
          value={text}
          placeholder="Write a message…"
          aria-label="Message"
          onInput={(event) => {
            setText(event.currentTarget.value);

            if (Date.now() - typedAt.current > TYPING_EVERY_MS) {
              typedAt.current = Date.now();
              onTyping();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <AttachButton uploads={uploads} />
        <button type="submit" class="fl-icon-button fl-send" aria-label="Send" disabled={busy}>
          <SendIcon />
        </button>
      </div>
    </form>
  );
};

/** Asks for an email or a phone before the visitor writes, when the messenger requires one. */
export const Identify = ({ onSubmit }: { onSubmit: (identity: Identity) => Promise<void> }) => {
  const [contact, setContact] = useState('');
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  return (
    <form
      class="fl-identify"
      onSubmit={(event) => {
        event.preventDefault();

        const value = contact.trim();
        const identity = value.includes('@') ? { email: value } : { phone: value };

        setSaving(true);
        setError(null);
        onSubmit({ ...identity, firstName: firstName.trim() || undefined })
          .catch((failure: unknown) => setError(messageOf(failure)))
          .finally(() => setSaving(false));
      }}
    >
      <p>Leave your email or phone number so we can get back to you.</p>
      <input
        required
        value={contact}
        aria-label="Email or phone"
        placeholder="Email or phone"
        onInput={(event) => setContact(event.currentTarget.value)}
      />
      <input
        value={firstName}
        aria-label="Your name"
        placeholder="Your name (optional)"
        onInput={(event) => setFirstName(event.currentTarget.value)}
      />
      {error && (
        <p class="fl-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" class="fl-primary" disabled={saving}>
        Continue
      </button>
    </form>
  );
};
