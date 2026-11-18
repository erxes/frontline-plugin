import { IconLock, IconMessage2, IconPaperclip, IconSend } from '@tabler/icons-react';
import { Button, cn, Editor, editorText, Kbd, storedFamily, Tabs } from 'erxes-ui';
import { useAtom } from 'jotai';
import { RESET } from 'jotai/utils';
import { type SubmitEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { PLUGIN } from '~/plugin.ts';
import { SendSurvey } from '~/modules/surveys/SurveyMessage.tsx';
import { takesNotesOnly } from '~/shared/kinds.tsx';
import { type Attachment, FileList, FilePicker } from '~/shared/Files.tsx';
import { type Conversation, useSendTyping } from './queries.ts';
import { useSendMessage } from './changes.ts';
import { useSlashItems } from './slashItems.tsx';
import { TemplatePicker } from './TemplatePicker.tsx';
import { useSendShortcut } from './useSendShortcut.ts';

const MODES = ['reply', 'note'] as const;

type Mode = (typeof MODES)[number];

/**
 * What the member has written in each conversation and not sent yet: the text, whether it is a
 * note, and the files. It stays while they switch conversations or reload, for as long as the tab
 * is open, as the old inbox kept it.
 */
const drafts = storedFamily({
  key: `${PLUGIN}:inbox-draft`,
  schema: z.object({
    html: z.string(),
    note: z.boolean(),
    attachments: z.array(
      z.object({
        url: z.string(),
        name: z.string(),
        type: z.string().optional(),
        size: z.number().optional(),
      }),
    ),
  }),
  initial: { html: '', note: false, attachments: [] },
  session: true,
});

/** The send shortcut, as the member's keyboard labels it. */
const SHORTCUT = navigator.userAgent.includes('Mac') ? '⌘↵' : 'Ctrl↵';

/**
 * The composer's foot, in the old inbox's order: the files attached so far, then templates,
 * attach and survey as icons on the left, the send shortcut and Send, or Add note in a note.
 */
const Actions = ({
  conversation,
  note,
  disabled,
  attachments,
  onAttachments,
  onTemplate,
}: {
  conversation: Conversation;
  note: boolean;
  disabled: boolean;
  attachments: Attachment[];
  onAttachments: (update: (files: Attachment[]) => Attachment[]) => void;
  onTemplate: (content: string) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      {attachments.length > 0 && (
        <div className="px-3">
          <FileList
            files={attachments}
            onRemove={(file) => onAttachments((files) => files.filter((other) => other !== file))}
          />
        </div>
      )}
      <div className="flex items-center gap-1 p-2">
        {!note && <TemplatePicker channelId={conversation.channelId} onPick={onTemplate} />}
        <FilePicker
          icon={<IconPaperclip />}
          label={t('attach-file', 'Attach file')}
          onUploaded={(file) => onAttachments((files) => [...files, file])}
        />
        {!note && <SendSurvey conversationId={conversation.id} />}
        <span className="flex-1" />
        <Kbd aria-hidden>{SHORTCUT}</Kbd>
        <Button type="submit" variant={note ? 'outline' : 'default'} disabled={disabled}>
          {note ? <IconLock /> : <IconSend />}
          {note ? t('add-note', 'Add note') : t('send', 'Send')}
        </Button>
      </div>
    </>
  );
};

/**
 * Reply or Internal note, and in a note, who sees it. A conversation that takes notes only, such
 * as a phone call's, offers no Reply.
 */
const ModeTabs = ({
  mode,
  notesOnly,
  onChange,
}: {
  mode: Mode;
  notesOnly: boolean;
  onChange: (mode: Mode) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <div className="flex items-center gap-3 p-2">
      <Tabs value={mode} onValueChange={(value: Mode) => onChange(value)}>
        <Tabs.List variant="segment">
          {!notesOnly && (
            <Tabs.Trigger value="reply">
              <IconMessage2 />
              {t('reply', 'Reply')}
            </Tabs.Trigger>
          )}
          <Tabs.Trigger value="note">
            <IconLock />
            {t('internal-note', 'Internal note')}
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs>
      {mode === 'note' && (
        <span className="truncate text-xs text-warning-text">
          {notesOnly
            ? t('notes-only-hint', 'A call takes notes only. Only your team sees them.')
            : t('note-hint', 'Only your team sees notes.')}
        </span>
      )}
    </div>
  );
};

/** The editor, as tall as what is written up to a limit, named and hinted for its mode. */
const ReplyEditor = ({
  note,
  initialContent,
  channelId,
  onChange,
}: {
  note: boolean;
  initialContent: string;
  channelId: string;
  onChange: (html: string) => void;
}) => {
  const { t } = useTranslation('frontline');
  const slashItems = useSlashItems({ channelId, note });

  return (
    <div className="px-2">
      <Editor
        label={note ? t('internal-note', 'Internal note') : t('reply', 'Reply')}
        placeholder={
          note
            ? t('note-placeholder', 'Write a note. Type / to mention a teammate.')
            : t('reply-placeholder', 'Write a reply. Type / for templates.')
        }
        initialContent={initialContent}
        isHTML
        variant="default"
        sideMenu={false}
        slashMenuOnTop
        additionalSlashMenuItems={slashItems}
        className="h-auto max-h-40 min-h-16"
        onChange={onChange}
      />
    </div>
  );
};

/**
 * Puts the cursor in the composer's editor, on the next frame, once a new one has mounted, and
 * the ref for the composer's form that it searches.
 */
const useEditorFocus = () => {
  const form = useRef<HTMLFormElement | null>(null);

  const focus = () =>
    requestAnimationFrame(() =>
      form.current?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus(),
    );

  const attach = (node: HTMLFormElement | null) => {
    form.current = node;
  };

  return { attach, focus };
};

/**
 * The conversation's draft and what changes it. `clear` empties it as a message goes, and
 * `restore` puts a refused message back before anything written since.
 */
const useDraft = (conversation: Conversation) => {
  const [draft, setDraft] = useAtom(drafts(conversation.id));
  const notesOnly = takesNotesOnly(conversation.kind);

  return {
    ...draft,
    notesOnly,
    note: notesOnly || draft.note,
    setHtml: (html: string) => setDraft((current) => ({ ...current, html })),
    setNote: (note: boolean) => setDraft((current) => ({ ...current, note })),
    setAttachments: (update: (files: Attachment[]) => Attachment[]) =>
      setDraft((current) => ({ ...current, attachments: update(current.attachments) })),
    // A member writing notes stays in the note tab for the next one.
    clear: () =>
      setDraft((current) => (current.note ? { html: '', attachments: [], note: true } : RESET)),
    restore: (sent: { html: string; attachments: Attachment[]; note: boolean }) =>
      setDraft((current) => ({
        note: sent.note,
        html: editorText(current.html) ? sent.html + current.html : sent.html,
        attachments: [...sent.attachments, ...current.attachments],
      })),
  };
};

/**
 * The reply box, a compact card under the thread like the old inbox's: a reply goes to the
 * customer, an internal note stays with the team and can mention teammates. A note turns the
 * whole card yellow and its button reads Add note, so it can't pass for a reply. `/` opens the
 * formatting, the channel's response templates and, in a note, the teammates. Files attach
 * through core's upload. Ctrl or ⌘ with Enter sends it, and the cursor stays in the box. What
 * is written stays as the conversation's draft until it goes.
 */
export const Composer = ({ conversation }: { conversation: Conversation }) => {
  const draft = useDraft(conversation);
  const { html, attachments, note, setHtml } = draft;
  const mode: Mode = note ? 'note' : 'reply';
  // Each change from outside the editor (a send, a template) starts a new one with the content.
  const [version, setVersion] = useState(0);
  const { attach, focus: focusEditor } = useEditorFocus();
  const send = useSendMessage();
  const sendTyping = useSendTyping(conversation.id);
  const empty = !editorText(html) && attachments.length === 0;

  const restart = (content: string) => {
    setHtml(content);
    setVersion((count) => count + 1);
    focusEditor();
  };

  const submit = (event?: SubmitEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (empty || send.isPending) return;

    draft.clear();
    setVersion((count) => count + 1);
    focusEditor();
    send.mutate(
      { conversationId: conversation.id, html, attachments, internal: note },
      {
        onError: () => {
          draft.restore({ html, attachments, note });
          setVersion((count) => count + 1);
        },
      },
    );
  };

  const shortcut = useSendShortcut({ send: submit });

  return (
    <div className="mx-auto w-full max-w-2xl shrink-0 p-3">
      <form
        ref={(node) => {
          attach(node);
          shortcut(node);
        }}
        onSubmit={submit}
        className={cn(
          'flex flex-col rounded-lg border bg-background shadow-xs',
          note && 'border-warning bg-warning/10',
        )}
      >
        <ModeTabs
          mode={mode}
          notesOnly={draft.notesOnly}
          onChange={(value) => {
            draft.setNote(value === 'note');
            focusEditor();
          }}
        />
        <ReplyEditor
          // A new editor per mode names itself for it, and one after each send starts empty.
          key={`${mode}-${version}`}
          note={note}
          initialContent={html}
          channelId={conversation.channelId}
          onChange={(value) => {
            setHtml(value);

            // A note stays with the team, so the visitor doesn't see it being written.
            if (!note) sendTyping();
          }}
        />
        <Actions
          conversation={conversation}
          note={note}
          disabled={send.isPending || empty}
          attachments={attachments}
          onAttachments={draft.setAttachments}
          onTemplate={(content) => restart(editorText(html) ? html + content : content)}
        />
      </form>
    </div>
  );
};
