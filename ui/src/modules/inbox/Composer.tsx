import { IconArrowBackUp, IconX } from '@tabler/icons-react';
import { Button, cn, editorText } from 'erxes-ui';
import { type KeyboardEvent, type SubmitEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Conversation, useSendTyping } from './queries.ts';
import { sendingTo, type useSendMessage } from './changes.ts';
import { useComposerFiles } from './ComposerFiles.tsx';
import { type Mode, ModeBar, Toolbar } from './ComposerBars.tsx';
import { type Quote, useDraft } from './composerDraft.ts';
import { focusComposer, ReplyEditor } from './ComposerEditor.tsx';
import { useSendShortcut } from './useSendShortcut.ts';

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
 * The reply box's card: a raised panel on the thread's background that rings while the member
 * writes in it; a note turns it yellow, rule and ring with it.
 */
const cardLook = (note: boolean) =>
  cn(
    '@container flex flex-col rounded-xl border bg-background shadow-sm transition-colors',
    !note && 'focus-within:border-ring/60 focus-within:ring-2 focus-within:ring-ring/15',
    note && 'border-warning/60 bg-warning/10 focus-within:ring-2 focus-within:ring-warning/20',
  );

/** The message the reply answers, over the editor, with a button that drops it. */
const Quoted = ({ quote, onRemove }: { quote: Quote; onRemove: () => void }) => {
  const { t } = useTranslation('frontline');

  return (
    <div className="mx-3 mt-2 flex items-center gap-2 rounded-md border-l-2 border-primary bg-muted px-2 py-1 text-sm">
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
 * The reply box, a card under the thread as wide as it: Reply or Internal note on its top strip,
 * the editor, then one toolbar with Send. A reply goes to the customer; an internal note stays
 * with the team and can mention teammates, and it turns the card yellow and its button to Add
 * note, so it can't pass for a reply. `/` opens the formatting, the channel's response templates
 * and, in a note, the teammates; `:` the emoji. Enter starts a new paragraph and Shift+Enter a new
 * line; Ctrl or ⌘ with Enter sends, and the cursor stays in the box. Files attach from the
 * paperclip, a paste or a drop, and Send waits for them. What is written stays as the
 * conversation's draft until it goes.
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
  const busy = files.uploading || Boolean(sendingTo(send, conversation.id));
  const held = empty || busy;

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
    <div className="mx-auto w-full max-w-4xl shrink-0 px-4 pt-2 pb-4">
      <form
        ref={shortcut}
        data-composer
        onSubmit={submit}
        onKeyDownCapture={tabSwitch(note, draft.notesOnly, switchTab)}
        {...files.cardHandlers}
        className={cardLook(note)}
      >
        <ModeBar
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
        <Toolbar
          conversation={conversation}
          note={note}
          disabled={held}
          busy={busy}
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
