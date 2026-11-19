import { IconArrowBackUp, IconLock, IconMessage2, IconSend, IconX } from '@tabler/icons-react';
import { Button, cn, Editor, editorText, Kbd, Tabs } from 'erxes-ui';
import { type KeyboardEvent, type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SendSurvey } from '~/modules/surveys/SurveyMessage.tsx';
import type { Attachment } from '~/shared/Files.tsx';
import { type Conversation, useSendTyping } from './queries.ts';
import { sendingTo, type useSendMessage } from './changes.ts';
import { AttachButton, AttachedFiles, useComposerFiles } from './ComposerFiles.tsx';
import { type Quote, useDraft } from './composerDraft.ts';
import { useSlashItems } from './slashItems.tsx';
import { TemplatePicker } from './TemplatePicker.tsx';
import { useSendShortcut } from './useSendShortcut.ts';

const MODES = ['reply', 'note'] as const;

type Mode = (typeof MODES)[number];

/** The pane's send, which its thread shows while it goes. */
type Send = ReturnType<typeof useSendMessage>;

/**
 * Tab in the editor switches to the note and Shift+Tab to the reply, as the old composer did. In
 * the tab it names already, where there is no reply, or while a `/` menu is open, Tab stays the
 * editor's.
 */
const tabSwitch =
  (note: boolean, notesOnly: boolean, onSwitch: (note: boolean) => void) =>
  (event: KeyboardEvent<HTMLFormElement>) => {
    const next = !event.shiftKey;

    if (
      event.key !== 'Tab' ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      !(event.target instanceof HTMLElement && event.target.isContentEditable) ||
      event.currentTarget.querySelector('.bn-suggestion-decorator') ||
      next === note ||
      (!next && notesOnly)
    )
      return;

    event.preventDefault();
    event.stopPropagation();
    onSwitch(next);
  };

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
        {/* A narrow card keeps Send whole and drops the hint. */}
        <span aria-hidden className="hidden @sm:block">
          <Kbd>{SHORTCUT}</Kbd>
        </span>
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
            <Tabs.Trigger value="reply" aria-keyshortcuts="Shift+Tab">
              <IconMessage2 />
              {t('reply', 'Reply')}
            </Tabs.Trigger>
          )}
          <Tabs.Trigger value="note" aria-keyshortcuts={notesOnly ? undefined : 'Tab'}>
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

/** Puts the cursor in the composer's editor, on the next frame, once a new one has mounted. */
export const focusComposer = () =>
  requestAnimationFrame(() =>
    document.querySelector<HTMLElement>('[data-composer] [contenteditable="true"]')?.focus(),
  );

/** The message the reply answers, over the editor, with a button that drops it. */
const Quoted = ({ quote, onRemove }: { quote: Quote; onRemove: () => void }) => {
  const { t } = useTranslation('frontline');

  return (
    <div className="mx-2 flex items-center gap-2 rounded-md border-l-2 border-primary bg-muted px-2 py-1 text-sm">
      <IconArrowBackUp className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-muted-foreground">{t('replying-to', 'Replying to')}: </span>
        {quote.text}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label={t('remove-quote', 'Remove quote')}
        onClick={onRemove}
      >
        <IconX />
      </Button>
    </div>
  );
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
  const sendTyping = useSendTyping(conversation.id);
  const empty = !editorText(html) && attachments.length === 0;
  const files = useComposerFiles(note, draft.attach);
  // A message waits for its files, so none is sent without one still uploading.
  // The send is the pane's, so one still going in another conversation holds nothing here.
  const held = empty || files.uploading || Boolean(sendingTo(send, conversation.id));

  const switchTab = (toNote: boolean) => {
    draft.setNote(toNote);
    focusComposer();
  };

  const restart = (content: string) => {
    setHtml(content);
    setVersion((count) => count + 1);
    focusComposer();
  };

  const submit = (event?: SubmitEvent<HTMLFormElement>) => {
    event?.preventDefault();

    if (held) return;

    // A note answers no message.
    const quote = note ? null : draft.quote;

    draft.clear();
    setVersion((count) => count + 1);
    focusComposer();
    send.mutate(
      { conversationId: conversation.id, html, attachments, internal: note, replyToId: quote?.id },
      {
        onError: () => {
          draft.restore({ html, attachments, quote, note });
          setVersion((count) => count + 1);
        },
      },
    );
  };

  const shortcut = useSendShortcut({ send: submit });

  return (
    <div className="mx-auto w-full max-w-2xl shrink-0 p-3">
      <form
        ref={shortcut}
        data-composer
        onSubmit={submit}
        onKeyDownCapture={tabSwitch(note, draft.notesOnly, switchTab)}
        {...files.cardHandlers}
        className={cn(
          '@container flex flex-col rounded-lg border bg-background shadow-xs',
          note && 'border-warning bg-warning/10',
        )}
      >
        <ModeTabs
          mode={mode}
          notesOnly={draft.notesOnly}
          onChange={(value) => switchTab(value === 'note')}
        />
        {!note && draft.quote && <Quoted quote={draft.quote} onRemove={draft.unquote} />}
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
