import { editorText } from 'erxes-ui';
import { z } from 'zod';
import { draftsOf, useDraft as useSavedDraft } from '~/shared/drafts.ts';
import type { Attachment } from '~/shared/Files.tsx';
import { takesNotesOnly } from '~/shared/kinds.tsx';
import type { Conversation } from './queries.ts';

/** The message a reply answers, and its text as the composer shows it. */
const Quote = z.object({ id: z.string(), text: z.string() });

export type Quote = z.infer<typeof Quote>;

/** One tab's unsent text and files, and for a reply, the message it answers. */
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
  quote: Quote.nullable().default(null),
});

type Part = z.infer<typeof Part>;

const EMPTY: Part = { html: '', attachments: [], quote: null };

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

/** What the member sent from one tab, put back when it is refused. */
type Sent = { html: string; attachments: Attachment[]; quote: Quote | null; note: boolean };

/**
 * The open tab's draft in the conversation and what changes it. `clear` empties the tab as its
 * message goes, and drops the draft once nothing is left; `restore` puts a refused message back
 * in its tab, before anything written since.
 */
export const useDraft = (conversation: Conversation) => {
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
    unquote: () => edit((current) => ({ ...current, quote: null })),
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
    restore: (sent: Sent) =>
      save((current) => {
        const kept = sent.note ? current.internal : current.reply;

        return withPart({ ...current, note: sent.note }, sent.note, {
          html: editorText(kept.html) ? sent.html + kept.html : sent.html,
          attachments: [...sent.attachments, ...kept.attachments],
          quote: sent.quote ?? kept.quote,
        });
      }),
  };
};

/** Makes the conversation's reply answer one message, and opens the reply tab for it. */
export const useQuote = (conversationId: string) => {
  const { save } = useSavedDraft(conversationDrafts, conversationId, NO_DRAFT);

  return (quote: Quote) =>
    save((current) => ({ ...current, note: false, reply: { ...current.reply, quote } }));
};
