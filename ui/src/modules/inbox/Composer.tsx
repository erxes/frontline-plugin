import { IconLock, IconMessage2, IconSend } from '@tabler/icons-react';
import { Button, cn, Editor, editorText, Kbd, Tabs } from 'erxes-ui';
import { type SubmitEvent, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { SendSurvey } from '~/modules/surveys/SurveyMessage.tsx';
import { draftsOf, useDraft as useSavedDraft } from '~/shared/drafts.ts';
import { takesNotesOnly } from '~/shared/kinds.tsx';
import type { Attachment } from '~/shared/Files.tsx';
import { type Conversation, useSendTyping } from './queries.ts';
import { sendingTo, type useSendMessage } from './changes.ts';
import { AttachButton, AttachedFiles, useComposerFiles } from './ComposerFiles.tsx';
import { useSlashItems } from './slashItems.tsx';
import { TemplatePicker } from './TemplatePicker.tsx';
import { useSendShortcut } from './useSendShortcut.ts';

const MODES = ['reply', 'note'] as const;

type Mode = (typeof MODES)[number];

/** One tab's unsent text and files. */
const Part = z.object({
  html: z.string(),
  attachments: z.array(
    z.object({
      url: z.string(),
      name: z.string(),
      type: z.string().optional(),
      size: z.number().optional(),
    }),
  ),
});

type Part = z.infer<typeof Part>;

const EMPTY: Part = { html: '', attachments: [] };

/**
 * What the member has written in each conversation and not sent: the reply and the note apart,
 * and which tab was open. It stays while they switch conversations or reload, for as long as the
 * tab is open, as the old inbox kept it.
 */
const Draft = z.object({ note: z.boolean(), reply: Part, internal: Part });

type Draft = z.infer<typeof Draft>;

const conversationDrafts = draftsOf('conversation', Draft);

const NO_DRAFT: Draft = { note: false, reply: EMPTY, internal: EMPTY };

/** The draft with the note's part, or the reply's, replaced. */
const withPart = (draft: Draft, note: boolean, part: Part): Draft =>
  note ? { ...draft, internal: part } : { ...draft, reply: part };

const isEmpty = (part: Part) => !editorText(part.html) && part.attachments.length === 0;

/** The pane's send, which its thread shows while it goes. */
type Send = ReturnType<typeof useSendMessage>;

/** The send shortcut, as the member's keyboard labels it. */
const SHORTCUT = navigator.userAgent.includes('Mac') ? '⌘↵' : 'Ctrl↵';

/**
 * A template's text as HTML paragraphs, one a line, for one picked from the popover. erxes-ui's
 * editor takes no blocks from outside, so only `/` inside it keeps a template's formatting.
 */
const paragraphs = (text: string) =>
  text
    .split('\n')
    .map(
      (line) =>
        `<p>${line.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>`,
    )
    .join('');

/**
 * The composer's foot, in the old inbox's order: the files attached so far, then templates,
 * attach and survey as icons on the left, the send shortcut and Send, or Add note in a note.
 */
const Actions = ({
  conversation,
  note,
  disabled,
  files,
  attachments,
  onAttachments,
  onTemplate,
}: {
  conversation: Conversation;
  note: boolean;
  disabled: boolean;
  files: ReturnType<typeof useComposerFiles>;
  attachments: Attachment[];
  onAttachments: (update: (files: Attachment[]) => Attachment[]) => void;
  onTemplate: (content: string) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <>
      <AttachedFiles
        files={files}
        attachments={attachments}
        onRemove={(file) => onAttachments((current) => current.filter((other) => other !== file))}
      />
      <div className="flex items-center gap-1 p-2">
        {!note && <TemplatePicker channelId={conversation.channelId} onPick={onTemplate} />}
        <AttachButton files={files} />
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
 * The open tab's draft in the conversation and what changes it. `clear` empties the tab as its
 * message goes, and drops the draft once nothing is left; `restore` puts a refused message back
 * in its tab, before anything written since.
 */
const useDraft = (conversation: Conversation) => {
  const { value, save, clear } = useSavedDraft(conversationDrafts, conversation.id, NO_DRAFT);
  const notesOnly = takesNotesOnly(conversation.kind);
  const note = notesOnly || value.note;
  const part = note ? value.internal : value.reply;

  const edit = (update: (current: Part) => Part) =>
    save((current) => withPart(current, note, update(note ? current.internal : current.reply)));

  return {
    ...part,
    notesOnly,
    note,
    setHtml: (html: string) => edit((current) => ({ ...current, html })),
    setNote: (next: boolean) => save((current) => ({ ...current, note: next })),
    setAttachments: (update: (files: Attachment[]) => Attachment[]) =>
      edit((current) => ({ ...current, attachments: update(current.attachments) })),
    // A file lands in the tab it was added in, which may no longer be open.
    attach: (tab: boolean, file: Attachment) =>
      save((current) => {
        const landing = tab ? current.internal : current.reply;

        return withPart(current, tab, { ...landing, attachments: [...landing.attachments, file] });
      }),
    // A member writing notes stays in the note tab for the next one.
    clear: () => {
      if (!value.note && isEmpty(note ? value.reply : value.internal)) clear();
      else edit(() => EMPTY);
    },
    restore: (sent: { html: string; attachments: Attachment[]; note: boolean }) =>
      save((current) => {
        const kept = sent.note ? current.internal : current.reply;

        return withPart({ ...current, note: sent.note }, sent.note, {
          html: editorText(kept.html) ? sent.html + kept.html : sent.html,
          attachments: [...sent.attachments, ...kept.attachments],
        });
      }),
  };
};

/**
 * The reply box, a compact card under the thread like the old inbox's: a reply goes to the
 * customer, an internal note stays with the team and can mention teammates. A note turns the
 * whole card yellow and its button reads Add note, so it can't pass for a reply. `/` opens the
 * formatting, the channel's response templates and, in a note, the teammates. Files attach from
 * the paperclip, a paste or a drop, and Send waits for them. Ctrl or ⌘ with Enter sends it, and the cursor stays in the box. What
 * is written stays as the conversation's draft until it goes.
 */
export const Composer = ({ conversation, send }: { conversation: Conversation; send: Send }) => {
  const draft = useDraft(conversation);
  const { html, attachments, note, setHtml } = draft;
  const mode: Mode = note ? 'note' : 'reply';
  // Each change from outside the editor (a send, a template) starts a new one with the content.
  const [version, setVersion] = useState(0);
  const { attach, focus: focusEditor } = useEditorFocus();
  const sendTyping = useSendTyping(conversation.id);
  const empty = !editorText(html) && attachments.length === 0;
  const files = useComposerFiles(note, draft.attach);
  // A message waits for its files, so none is sent without one still uploading.
  // The send is the pane's, so one still going in another conversation holds nothing here.
  const held = empty || files.uploading || Boolean(sendingTo(send, conversation.id));

  const restart = (content: string) => {
    setHtml(content);
    setVersion((count) => count + 1);
    focusEditor();
  };

  const submit = (event?: SubmitEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (held) return;

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
        {...files.cardHandlers}
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
          disabled={held}
          files={files}
          attachments={attachments}
          onAttachments={draft.setAttachments}
          onTemplate={(content) =>
            restart((editorText(html) ? html : '') + paragraphs(editorText(content)))
          }
        />
      </form>
    </div>
  );
};
