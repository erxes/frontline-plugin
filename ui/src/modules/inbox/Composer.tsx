import { IconLock, IconMessage2, IconSend } from '@tabler/icons-react';
import { Button, cn, Editor, editorText, Tabs } from 'erxes-ui';
import { type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Attachment, FileList, FilePicker } from '~/shared/Files.tsx';
import { type Conversation, useSendMessage, useSendTyping } from './queries.ts';
import { useSlashItems } from './slashItems.tsx';
import { useSendShortcut } from './useSendShortcut.ts';

const MODES = ['reply', 'note'] as const;

type Mode = (typeof MODES)[number];

/** Reply or Internal note, above the editor. */
const ModeTabs = ({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) => {
  const { t } = useTranslation('frontline');

  return (
    <Tabs value={mode} onValueChange={(value: Mode) => onChange(value)}>
      <Tabs.List variant="segment" className="w-fit">
        <Tabs.Trigger value="reply">
          <IconMessage2 />
          {t('reply', 'Reply')}
        </Tabs.Trigger>
        <Tabs.Trigger value="note">
          <IconLock />
          {t('internal-note', 'Internal note')}
        </Tabs.Trigger>
      </Tabs.List>
    </Tabs>
  );
};

/**
 * The reply box under the thread, on erxes-ui's editor: a reply goes to the customer, an internal
 * note stays with the team and can mention teammates. `/` opens the formatting, the channel's
 * response templates and, in a note, the teammates. Files attach through core's upload. Ctrl or ⌘
 * with Enter sends it.
 */
export const Composer = ({ conversation }: { conversation: Conversation }) => {
  const { t } = useTranslation('frontline');
  const [mode, setMode] = useState<Mode>('reply');
  const [html, setHtml] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [sent, setSent] = useState(0);
  const send = useSendMessage();
  const sendTyping = useSendTyping(conversation.id);
  const note = mode === 'note';
  const slashItems = useSlashItems({ channelId: conversation.channelId, note });
  const empty = !editorText(html) && attachments.length === 0;

  const submit = (event?: SubmitEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (empty || send.isPending) return;

    send.mutate(
      { conversationId: conversation.id, html, attachments, internal: note },
      {
        onSuccess: () => {
          setHtml('');
          setAttachments([]);
          setSent((count) => count + 1);
        },
      },
    );
  };

  const shortcut = useSendShortcut({ send: submit });

  return (
    <form
      ref={shortcut}
      onSubmit={submit}
      className={cn('flex flex-col gap-2 border-t p-3', note && 'bg-warning-surface')}
    >
      <ModeTabs mode={mode} onChange={setMode} />
      <Editor
        // A new editor per mode names itself for it, and one after each send starts empty.
        key={`${mode}-${sent}`}
        label={note ? t('internal-note', 'Internal note') : t('reply', 'Reply')}
        initialContent={html}
        isHTML
        sideMenu={false}
        slashMenuOnTop
        additionalSlashMenuItems={slashItems}
        className="max-h-60 min-h-20"
        onChange={(value) => {
          setHtml(value);

          // A note stays with the team, so the visitor doesn't see it being written.
          if (!note) sendTyping();
        }}
      />
      {attachments.length > 0 && (
        <FileList
          files={attachments}
          onRemove={(file) => setAttachments((files) => files.filter((other) => other !== file))}
        />
      )}
      <div className="flex items-center gap-2">
        <FilePicker
          label={t('attach-file', 'Attach file')}
          onUploaded={(file) => setAttachments((files) => [...files, file])}
        />
        <span className="flex-1 text-xs text-muted-foreground">
          {note
            ? t('note-hint', 'Only your team sees notes. Type / to mention a teammate.')
            : t('reply-hint', 'Type / for response templates and formatting.')}
        </span>
        <Button type="submit" disabled={send.isPending || empty}>
          <IconSend />
          {note ? t('add-note', 'Add note') : t('send', 'Send')}
        </Button>
      </div>
    </form>
  );
};
