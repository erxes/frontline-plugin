import {
  IconChevronDown,
  IconChevronUp,
  IconLock,
  IconMessage2,
  IconSend,
} from '@tabler/icons-react';
import { Button, cn, Editor, editorText, IconTip, Kbd, Resizable, Tabs } from 'erxes-ui';
import { type ReactNode, type SubmitEvent, useRef, useState } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { useTranslation } from 'react-i18next';
import { type Attachment, FileList, FilePicker } from '~/shared/Files.tsx';
import { type Conversation, useSendMessage, useSendTyping } from './queries.ts';
import { useSlashItems } from './slashItems.tsx';
import { useSendShortcut } from './useSendShortcut.ts';

const MODES = ['reply', 'note'] as const;

type Mode = (typeof MODES)[number];

/** The send shortcut's modifier key, as the member's keyboard labels it. */
const MOD = navigator.userAgent.includes('Mac') ? '⌘' : 'Ctrl';

/** The reply box's top row: Reply or Internal note, and the chevron that folds it. */
const Head = ({
  mode,
  onChange,
  folded,
  onFold,
}: {
  mode: Mode;
  onChange: (mode: Mode) => void;
  folded: boolean;
  onFold: () => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <div className="flex items-center justify-between gap-2">
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
      <FoldButton folded={folded} onClick={onFold} />
    </div>
  );
};

/** Folds the reply box down to its tabs, or opens it again. */
const FoldButton = ({ folded, onClick }: { folded: boolean; onClick: () => void }) => {
  const { t } = useTranslation('frontline');

  const label = folded
    ? t('expand-composer', 'Expand the reply box')
    : t('fold-composer', 'Fold the reply box');

  return (
    <IconTip label={label}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={label}
        aria-expanded={!folded}
        onClick={onClick}
      >
        {folded ? <IconChevronUp /> : <IconChevronDown />}
      </Button>
    </IconTip>
  );
};

/**
 * The composer's foot, in the old inbox's order: attach on the left, then a hint, the send
 * shortcut and Send, or Add note in a note.
 */
const Actions = ({
  note,
  disabled,
  onUploaded,
}: {
  note: boolean;
  disabled: boolean;
  onUploaded: (file: Attachment) => void;
}) => {
  const { t } = useTranslation('frontline');

  return (
    <div className="flex items-center gap-2">
      <FilePicker label={t('attach-file', 'Attach file')} onUploaded={onUploaded} />
      <span className="flex-1 text-xs text-muted-foreground">
        {note
          ? t('note-hint', 'Only your team sees notes. Type / to mention a teammate.')
          : t('reply-hint', 'Type / for response templates and formatting.')}
      </span>
      <span className="flex items-center gap-0.5" aria-hidden>
        <Kbd>{MOD}</Kbd>
        <Kbd>↵</Kbd>
      </span>
      <Button type="submit" variant={note ? 'outline' : 'default'} disabled={disabled}>
        {note ? <IconLock /> : <IconSend />}
        {note ? t('add-note', 'Add note') : t('send', 'Send')}
      </Button>
    </div>
  );
};

/** The composer's height when folded to its tabs. */
const FOLDED = 64;

/**
 * The reply box, on erxes-ui's editor, as a card like the old inbox's: a reply goes to the
 * customer, an internal note stays with the team and can mention teammates. A note turns the card
 * yellow and its button reads Add note, so it can't pass for a reply. `/` opens the formatting,
 * the channel's response templates and, in a note, the teammates. Files attach through core's
 * upload. Ctrl or ⌘ with Enter sends it. Folded, it shows only its tabs.
 */
const ReplyBox = ({
  conversation,
  folded,
  onFold,
}: {
  conversation: Conversation;
  folded: boolean;
  onFold: () => void;
}) => {
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
      className={cn(
        'm-3 mt-0 flex min-h-0 flex-1 flex-col gap-2 rounded-lg border bg-background p-2 shadow-xs',
        note && 'border-warning bg-warning/10',
      )}
    >
      <Head mode={mode} onChange={setMode} folded={folded} onFold={onFold} />
      {!folded && (
        <>
          <Editor
            // A new editor per mode names itself for it, and one after each send starts empty.
            key={`${mode}-${sent}`}
            label={note ? t('internal-note', 'Internal note') : t('reply', 'Reply')}
            initialContent={html}
            isHTML
            sideMenu={false}
            slashMenuOnTop
            additionalSlashMenuItems={slashItems}
            className="min-h-0 flex-1 overflow-y-auto"
            onChange={(value) => {
              setHtml(value);

              // A note stays with the team, so the visitor doesn't see it being written.
              if (!note) sendTyping();
            }}
          />
          {attachments.length > 0 && (
            <FileList
              files={attachments}
              onRemove={(file) =>
                setAttachments((files) => files.filter((other) => other !== file))
              }
            />
          )}
          <Actions
            note={note}
            disabled={send.isPending || empty}
            onUploaded={(file) => setAttachments((files) => [...files, file])}
          />
        </>
      )}
    </form>
  );
};

/**
 * The thread, as `children`, over the reply box, with a handle between them that drags the box's
 * height and a chevron that folds it to its tabs, as the old inbox had.
 */
export const Composer = ({
  conversation,
  children,
}: {
  conversation: Conversation;
  children: ReactNode;
}) => {
  const { t } = useTranslation('frontline');
  const panel = useRef<PanelImperativeHandle>(null);
  const [folded, setFolded] = useState(false);

  return (
    <Resizable.PanelGroup orientation="vertical" className="min-h-0 flex-1">
      <Resizable.Panel minSize={120} className="flex h-full flex-col">
        {children}
      </Resizable.Panel>
      <Resizable.Handle withHandle aria-label={t('resize-composer', 'Resize the reply box')} />
      <Resizable.Panel
        panelRef={panel}
        defaultSize={240}
        minSize={160}
        maxSize="70%"
        collapsible
        collapsedSize={FOLDED}
        onResize={(size) => setFolded(size.inPixels <= FOLDED)}
        className="flex h-full flex-col"
      >
        <ReplyBox
          conversation={conversation}
          folded={folded}
          onFold={() => (folded ? panel.current?.expand() : panel.current?.collapse())}
        />
      </Resizable.Panel>
    </Resizable.PanelGroup>
  );
};
